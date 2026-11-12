param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Clear-TransparentRgb([System.Drawing.Bitmap]$Bitmap) {
  $rect = [System.Drawing.Rectangle]::new(0, 0, $Bitmap.Width, $Bitmap.Height)
  $data = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    if ($data.Stride -le 0) { throw 'Unexpected negative bitmap stride.' }
    $row = [byte[]]::new($data.Stride)
    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
      $rowPtr = [IntPtr]::Add($data.Scan0, $y * $data.Stride)
      [Runtime.InteropServices.Marshal]::Copy($rowPtr, $row, 0, $row.Length)
      for ($x = 0; $x -lt $Bitmap.Width; $x++) {
        $i = $x * 4
        if ($row[$i + 3] -eq 0) { $row[$i] = 0; $row[$i + 1] = 0; $row[$i + 2] = 0 }
      }
      [Runtime.InteropServices.Marshal]::Copy($row, 0, $rowPtr, $row.Length)
    }
  } finally {
    $Bitmap.UnlockBits($data)
  }
}

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Icon source not found: $Source" }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$sourceImage = [System.Drawing.Image]::FromFile($Source)
try {
  if ($sourceImage.Width -ne $sourceImage.Height -or $sourceImage.Width -lt 512) {
    throw "Icon source must be square and at least 512px: $($sourceImage.Width)x$($sourceImage.Height)"
  }
  $normalized = [System.Drawing.Bitmap]::new($sourceImage.Width, $sourceImage.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $normalizer = [System.Drawing.Graphics]::FromImage($normalized)
    try {
      $normalizer.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $normalizer.DrawImage($sourceImage, 0, 0, $sourceImage.Width, $sourceImage.Height)
    } finally { $normalizer.Dispose() }
    Clear-TransparentRgb $normalized
    foreach ($size in @(16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 192, 256, 512, 1024)) {
      $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.Clear([System.Drawing.Color]::Transparent)
          $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
          $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.DrawImage($normalized, 0, 0, $size, $size)
        } finally { $graphics.Dispose() }
        Clear-TransparentRgb $bitmap
        $destination = Join-Path $OutputDirectory "$size.png"
        $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $bitmap.Dispose() }
    }
  } finally { $normalized.Dispose() }
} finally { $sourceImage.Dispose() }

