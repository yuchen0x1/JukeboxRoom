package com.openmusic.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

@CapacitorPlugin(name = "NativeMedia")
public class NativeMediaPlugin extends Plugin {
    private static volatile NativeMediaPlugin activePlugin;
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;
    private String requestedQueueId;
    private String requestedStatus = "idle";
    private final java.util.concurrent.atomic.AtomicLong loadGeneration = new java.util.concurrent.atomic.AtomicLong();

    static NativeMediaPlugin getActivePlugin() { return activePlugin; }

    @Override
    public void load() {
        activePlugin = this;
        Context context = getContext();
        SessionToken token = new SessionToken(context,
                new ComponentName(context, NativeMediaService.class));
        controllerFuture = new MediaController.Builder(context, token).buildAsync();
        controllerFuture.addListener(() -> {
            try {
                controller = controllerFuture.get();
                controller.addListener(new androidx.media3.common.Player.Listener() {
                    @Override
                    public void onIsPlayingChanged(boolean isPlaying) {
                        requestedStatus = isPlaying ? "playing" : (controller.getMediaItemCount() > 0 ? "paused" : "idle");
                        emitState(null);
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        if (playbackState == androidx.media3.common.Player.STATE_ENDED) requestedStatus = "ended";
                        emitState(null);
                    }

                    @Override
                    public void onPlayerError(@NonNull androidx.media3.common.PlaybackException error) {
                        requestedStatus = "error";
                        emitState(error.getMessage());
                    }
                });
                emitState(null);
            } catch (Exception e) {
                emitState(e.getMessage());
            }
        }, androidx.core.content.ContextCompat.getMainExecutor(context));
    }

    @PluginMethod
    public void load(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }
        String queueId = call.getString("queueId");
        long generation = loadGeneration.incrementAndGet();
        boolean autoplay = call.getBoolean("autoplay", true);
        requestedStatus = "loading";
        withController(call, c -> {
            if (generation != loadGeneration.get()) { call.resolve(); return; }
            requestedQueueId = queueId;
            androidx.media3.common.MediaItem item = new androidx.media3.common.MediaItem.Builder()
                    .setUri(url)
                    .setMediaId(queueId == null ? url : queueId)
                    .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder()
                            .setTitle(call.getString("title"))
                            .setArtist(call.getString("artist"))
                            .setAlbumTitle(call.getString("album"))
                            .setArtworkUri(uriOrNull(call.getString("artworkUrl")))
                            .build())
                    .build();
            long position = Math.max(0, call.getLong("position", 0L));
            c.setMediaItem(item, position);
            c.prepare();
            if (autoplay) {
                startService();
                c.play();
                requestedStatus = "playing";
            } else {
                c.pause();
                requestedStatus = "paused";
            }
            emitState(null);
            call.resolve();
        });
    }

    @PluginMethod public void play(PluginCall call) { withController(call, c -> { startService(); c.play(); requestedStatus = "playing"; emitState(null); call.resolve(); }); }
    @PluginMethod public void pause(PluginCall call) { withController(call, c -> { c.pause(); requestedStatus = "paused"; emitState(null); call.resolve(); }); }
    @PluginMethod public void seekTo(PluginCall call) { long position = Math.max(0, call.getLong("position", 0L)); withController(call, c -> { c.seekTo(position); emitState(null); call.resolve(); }); }
    @PluginMethod public void stop(PluginCall call) { long generation = loadGeneration.incrementAndGet(); withController(call, c -> { if (generation != loadGeneration.get()) { call.resolve(); return; } c.stop(); c.clearMediaItems(); requestedQueueId = null; requestedStatus = "idle"; stopService(); emitState(null); call.resolve(); }); }
    @PluginMethod public void setVolume(PluginCall call) { double volume = call.getDouble("volume", 1.0); withController(call, c -> { c.setVolume((float) Math.max(0.0, Math.min(1.0, volume))); call.resolve(); }); }
    @PluginMethod public void getState(PluginCall call) { withController(call, c -> call.resolve(buildState(null))); }

    private interface ControllerAction { void run(MediaController controller); }
    private void withController(PluginCall call, ControllerAction action) {
        if (controllerFuture == null) { call.reject("Media service is unavailable"); return; }
        controllerFuture.addListener(() -> {
            try {
                if (controller == null) controller = controllerFuture.get();
                action.run(controller);
            } catch (Exception e) {
                call.reject("Media controller error: " + e.getMessage(), e);
            }
        }, androidx.core.content.ContextCompat.getMainExecutor(getContext()));
    }

    @Override
    protected void handleOnDestroy() {
        if (activePlugin == this) activePlugin = null;
        if (controllerFuture != null) MediaController.releaseFuture(controllerFuture);
        controllerFuture = null;
        controller = null;
        super.handleOnDestroy();
    }

    private void startService() {
        Context context = getContext();
        Intent intent = new Intent(context, NativeMediaService.class);
        androidx.core.content.ContextCompat.startForegroundService(context, intent);
    }

    private void stopService() {
        getContext().stopService(new Intent(getContext(), NativeMediaService.class));
    }

    private void emitState(String error) {
        if (controller == null) return;
        notifyListeners("state", buildState(error));
    }

    private JSObject buildState(String error) {
        JSObject state = new JSObject();
        androidx.media3.common.MediaItem item = controller.getCurrentMediaItem();
        state.put("queueId", item == null ? requestedQueueId : item.mediaId);
        String status = requestedStatus;
        androidx.media3.common.PlaybackException failure = controller.getPlayerError();
        if (failure != null) { status = "error"; if (error == null) error = failure.getMessage(); }
        if (!"error".equals(status)) {
            int playbackState = controller.getPlaybackState();
            if (playbackState == androidx.media3.common.Player.STATE_ENDED) status = "ended";
            else if (playbackState == androidx.media3.common.Player.STATE_BUFFERING) status = "loading";
            else if (playbackState == androidx.media3.common.Player.STATE_READY) status = controller.getPlayWhenReady() ? "playing" : "paused";
            else if (item == null) status = "idle";
        }
        state.put("status", status);
        state.put("positionMs", controller.getCurrentPosition());
        long duration = controller.getDuration();
        state.put("durationMs", duration < 0 ? 0 : duration);
        if (error != null) state.put("error", error);
        return state;
    }

    void emitTransportEvent(String event) {
        JSObject payload = new JSObject();
        payload.put("queueId", requestedQueueId);
        payload.put("action", event);
        notifyListeners("transport", payload);
    }

    private static android.net.Uri uriOrNull(String value) { return value == null || value.isEmpty() ? null : android.net.Uri.parse(value); }
}
