package com.openmusic.app;

import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionResult;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

public class NativeMediaService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(), true);
        mediaSession = new MediaSession.Builder(this, player)
                .setCallback(new MediaSession.Callback() {
                    @Override
                    public MediaSession.ConnectionResult onConnect(MediaSession session,
                            MediaSession.ControllerInfo controller) {
                        MediaSession.ConnectionResult result = MediaSession.Callback.super.onConnect(session, controller);
                        androidx.media3.session.SessionCommands sessionCommands = result.availableSessionCommands.buildUpon()
                                .add(new SessionCommand("native_media_next", Bundle.EMPTY))
                                .add(new SessionCommand("native_media_previous", Bundle.EMPTY))
                                .build();
                        androidx.media3.common.Player.Commands playerCommands = result.availablePlayerCommands.buildUpon()
                                .add(Player.COMMAND_SEEK_TO_NEXT)
                                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                                .build();
                        return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                                .setAvailableSessionCommands(sessionCommands)
                                .setAvailablePlayerCommands(playerCommands)
                                .build();
                    }

                    @Override
                    public int onPlayerCommandRequest(MediaSession session,
                            MediaSession.ControllerInfo controller, int playerCommand) {
                        if (playerCommand == Player.COMMAND_SEEK_TO_NEXT
                                || playerCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM) {
                            notifyTransport("next");
                            return SessionResult.RESULT_SUCCESS;
                        }
                        if (playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS
                                || playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                            notifyTransport("previous");
                            return SessionResult.RESULT_SUCCESS;
                        }
                        return SessionResult.RESULT_SUCCESS;
                    }

                    @Override
                    public ListenableFuture<SessionResult> onCustomCommand(MediaSession session,
                            MediaSession.ControllerInfo controller, SessionCommand command,
                            android.os.Bundle args) {
                        if ("native_media_next".equals(command.customAction)) notifyTransport("next");
                        if ("native_media_previous".equals(command.customAction)) notifyTransport("previous");
                        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
                    }
                })
                .build();
    }

    private void notifyTransport(String action) {
        NativeMediaPlugin plugin = NativeMediaPlugin.getActivePlugin();
        if (plugin != null) plugin.emitTransportEvent(action);
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
