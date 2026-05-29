Deno.serve(async (_req) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Returning to Fund-It...</title>
  <script>window.location.replace('fundit://donate/success');</script>
</head>
<body>
  <p>Redirecting back to Fund-It...</p>
  <p><a href="fundit://donate/success">Tap here if not redirected automatically</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
});
