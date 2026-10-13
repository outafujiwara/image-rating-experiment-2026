const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyBCYAGRtIsqmHyRgS6p12T9Ge0uCmnL-ELcaPhrI63Yuh_bx25KWH6sJa1pgCQROqj/exec";
const PARTICIPANT_ID = "P001";
const TOTAL_IMAGES = 3;

let images = [];
let index = 0;
let results = [];

const statusText = document.getElementById("status");
const experiment = document.getElementById("experiment");
const imageEl = document.getElementById("image");
const progressText = document.getElementById("progress");
const buttonsDiv = document.getElementById("buttons");

// 001.png ～ 432.png を登録
images = Array.from({ length: TOTAL_IMAGES }, (_, i) => {
  const name = `${String(i + 1).padStart(3, "0")}.png`;

  return {
    name: name,
    src: `画像/${name}`
  };
});

// 画像をランダムな順番に並べ替える
for (let i = images.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [images[i], images[j]] = [images[j], images[i]];
}

// 画像の存在を確認してから実験開始
async function startExperiment() {
  statusText.textContent = "画像を確認しています...";

  try {
    // 全画像が存在するか確認
    for (const item of images) {
      const response = await fetch(item.src);

      if (!response.ok) {
        throw new Error(`${item.name} を読み込めません`);
      }
    }

    statusText.textContent =
      `${images.length}枚の画像を読み込みました。`;

    createButtons();
    experiment.hidden = false;
    showImage();

  } catch (error) {
    statusText.textContent =
      `画像を読み込めませんでした。${error.message}`;

    console.error(error);
  }
}

// 評価ボタンを作る
function createButtons() {
  buttonsDiv.innerHTML = "";

  for (let score = -3; score <= 3; score++) {
    const btn = document.createElement("button");

    btn.textContent = score > 0 ? `+${score}` : score;

    btn.addEventListener("click", () => {
      // 現在の画像と評価点を保存
      results.push({
        image: images[index].name,
        score: score,
        order: index + 1
      });

      index++;

      if (index < images.length) {
        showImage();
      } else {
        finish();
      }
    });

    buttonsDiv.appendChild(btn);
  }
}

// 現在の画像を表示
function showImage() {
  imageEl.src = images[index].src;

  progressText.textContent =
    `${index + 1} / ${images.length} 枚目`;
}

// 全画像の評価が終了


async function finish() {
  experiment.hidden = true;
  statusText.textContent = "回答を送信しています...";

  const payload = results.map(row => ({
    participantId: PARTICIPANT_ID,
    image: row.image,
    score: row.score,
    order: row.order
  }));

  try {
    await fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    statusText.textContent =
      `${payload.length}件の送信処理が終了しました。` +
      "スプレッドシートの保存結果を確認してください。";

  } catch (error) {
    statusText.textContent =
      "送信に失敗しました。管理者に連絡してください。";

    console.error(error);
  }
}



// CSVファイルに保存
function downloadCSV() {
  const escapeCSV = value =>
    `"${String(value).replace(/"/g, '""')}"`;

  const rows = [
    ["画像名", "評価点", "提示順"],
    ...results.map(row => [
      row.image,
      row.score,
      row.order
    ])
  ];

  const csv = "\uFEFF" + rows
    .map(row => row.map(escapeCSV).join(","))
    .join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "画像評価結果.csv";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 実験開始
startExperiment();
