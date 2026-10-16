export type RevokeState = { state: 'form' | 'wrong' | 'busy' | 'done' }

const MESSAGES: Record<RevokeState['state'], string> = {
  form: '公開したときに表示された失効コードを入れてください。失効すると、リンクは開けなくなり、写真も消えます。',
  wrong: 'コードがちがうか、このギフトはもう開けません。',
  busy: '試す回数が多すぎます。しばらく待ってからもう一度どうぞ。',
  done: 'ギフトを失効しました。リンクは開けなくなり、写真も消えました。',
}

/** Static text only; nothing from the request is echoed back. */
export function revokePage({ state }: RevokeState): string {
  const form =
    state === 'done'
      ? ''
      : `<form method="post">
  <label for="code">失効コード</label>
  <input id="code" name="code" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX" required maxlength="20" />
  <button type="submit">失効する</button>
</form>`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>ギフトの失効</title>
<style>
body { font-family: system-ui, sans-serif; background: #d8c9b0; color: #1a1614; margin: 0; padding: 24px 16px; }
main { max-width: 420px; margin: 0 auto; }
form { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
input { font: inherit; font-size: 20px; padding: 10px; letter-spacing: 0.1em; }
button { font: inherit; padding: 12px; background: #6b3030; color: #fff; border: 0; border-radius: 6px; }
</style>
</head>
<body>
<main>
<h1>ギフトの失効</h1>
<p data-state="${state}">${MESSAGES[state]}</p>
${form}
</main>
</body>
</html>`
}
