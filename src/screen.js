'use strict';

// Half-resolution JPEG of the primary screen, written to stdout.
const CAPTURE_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
  '$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
  '$full = New-Object System.Drawing.Bitmap $s.Width, $s.Height',
  '$g = [System.Drawing.Graphics]::FromImage($full)',
  '$g.CopyFromScreen($s.X, $s.Y, 0, 0, $s.Size)',
  '$small = New-Object System.Drawing.Bitmap $full, ([int]($s.Width / 2)), ([int]($s.Height / 2))',
  '$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }',
  '$p = New-Object System.Drawing.Imaging.EncoderParameters 1',
  '$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 40L',
  '$ms = New-Object System.IO.MemoryStream',
  '$small.Save($ms, $enc, $p)',
  '$g.Dispose(); $full.Dispose(); $small.Dispose()',
  '$out = [Console]::OpenStandardOutput(); $out.Write($ms.ToArray(), 0, $ms.Length); $out.Flush()',
].join('; ');

const FRAME_DELAY_MS = 400;

// Streams frames over Server-Sent Events until the client disconnects.
function streamScreen(req, res, runner) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let active = true;
  req.on('close', () => {
    active = false;
  });

  const loop = async () => {
    while (active) {
      try {
        const jpeg = await runner.powershell(CAPTURE_SCRIPT, { capture: true });
        if (active && jpeg.length) res.write(`data: ${jpeg.toString('base64')}\n\n`);
      } catch (err) {
        if (active) res.write(`event: erro\ndata: ${JSON.stringify(err.message)}\n\n`);
      }
      await new Promise((r) => setTimeout(r, FRAME_DELAY_MS));
    }
  };
  loop();
}

module.exports = { streamScreen };
