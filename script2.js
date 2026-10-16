
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyBCYAGRtIsqmHyRgS6p12T9Ge0uCmnL-ELcaPhrI63Yuh_bx25KWH6sJa1pgCQROqj/exec";
let PARTICIPANT_ID = "";
const TOTAL_IMAGES = 432;

const IMAGE_FOLDER = "画像/";
const AUDIO_FOLDER = "音声/";
const MAPPING_FILE = "対応表.csv";

let dollImages = [];
let remainingSilentImages = [];
let audioImages = [];
let currentImages = [];
let index = 0;
let results = [];
let phase = "doll";

let volume = 0.5;
let currentAudio = null;
let audioTimer = null;
let stopTimer = null;

const statusText = document.getElementById("status");
const experiment = document.getElementById("experiment");
const imageEl = document.getElementById("image");
const progressText = document.getElementById("progress");
const buttonsDiv = document.getElementById("buttons");

const volumeScreen = document.getElementById("volumeScreen");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const testSoundButton = document.getElementById("testSoundButton");
const continueButton = document.getElementById("continueButton");
const speakerIcon = document.getElementById("speakerIcon");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");

const transitionScreen = document.createElement("div");
transitionScreen.hidden = true;
transitionScreen.innerHTML = `
  <h2>前半の評価が終了しました</h2>
  <p>続いて、スマートスピーカー（音声なし）画像を評価します。</p>
  <button id="transitionButton" class="main-button">次へ</button>
`;
experiment.parentNode.insertBefore(transitionScreen, experiment);

startButton.addEventListener("click", () => {
  const input = document.getElementById("participantId");
  const number = Number(input.value);

  if (
    input.value.trim() === "" ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    alert("被験者番号を正しく入力してください。");
    input.focus();
    return;
  }

  PARTICIPANT_ID = "P" + String(number).padStart(3, "0");

  startScreen.hidden = true;
  statusText.textContent = "実験を準備しています...";
  startExperiment();
});

const transitionButton =
  document.getElementById("transitionButton");

// 配列をランダムに並べ替える
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 音声を停止する
function stopAudio() {
  clearTimeout(audioTimer);
  clearTimeout(stopTimer);

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

// CSVを読み込む
async function loadMapping() {
  const response = await fetch(
    MAPPING_FILE + "?t=" + Date.now()
  );

  if (!response.ok) {
    throw new Error(
      "対応表.csvを読み込めません。ファイルの場所を確認してください。"
    );
  }

  const text = (await response.text()).replace(/^\uFEFF/, "");

  const rows = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const mapping = new Map();

  for (const row of rows) {
    const columns = row.split(",").map(value =>
      value.trim().replace(/^"|"$/g, "")
    );

    if (columns.length < 2) {
      throw new Error("CSVの形式が正しくありません。");
    }

    const imageName = columns[0];
    const audioName = columns[1];

    if (!/^\d{3}\.png$/i.test(imageName)) {
      throw new Error(`画像名が正しくありません: ${imageName}`);
    }

    if (!/^voice\d{3}\.wav$/i.test(audioName)) {
      throw new Error(`音声名が正しくありません: ${audioName}`);
    }

    if (mapping.has(imageName)) {
      throw new Error(`画像が重複しています: ${imageName}`);
    }

    const imageNumber = Number(imageName.slice(0, 3));

    if (imageNumber <= 144) {
      throw new Error(
        `${imageName} は最初の人形画像です。音声の割り当て先を145.png以降にしてください。`
      );
    }

    mapping.set(imageName, audioName);
  }

  const audioCounts = new Map();

  for (const audioName of mapping.values()) {
    audioCounts.set(
      audioName,
      (audioCounts.get(audioName) || 0) + 1
    );
  }

  if (mapping.size !== 144) {
    throw new Error(
      `対応表は144枚必要ですが、現在${mapping.size}枚です。`
    );
  }

  if (
    audioCounts.size !== 72 ||
    [...audioCounts.values()].some(count => count !== 2)
  ) {
    throw new Error(
      "72種類の音声を、それぞれ2枚の画像に割り当ててください。"
    );
  }

  return mapping;
}

// 実験の準備
async function startExperiment() {
  statusText.textContent = "画像・音声・対応表を確認しています...";

  try {
    const mapping = await loadMapping();

    const allImages = Array.from(
      { length: TOTAL_IMAGES },
      (_, i) => {
        const name = `${String(i + 1).padStart(3, "0")}.png`;

        return {
          name,
          src: IMAGE_FOLDER + name,
          audio: mapping.get(name) || null
        };
      }
    );

    // 第1段階：001.png～144.png
    dollImages = allImages.filter(item => {
      const number = Number(item.name.slice(0, 3));
      return number <= 144;
    });

    // 第2段階：145.png～432.pngのうち音声がない画像
    remainingSilentImages = allImages.filter(item => {
      const number = Number(item.name.slice(0, 3));
      return number >= 145 && !item.audio;
    });

    // 第3段階：対応表にある音声付き画像
    audioImages = allImages.filter(item => Boolean(item.audio));

    if (
      dollImages.length !== 144 ||
      remainingSilentImages.length !== 144 ||
      audioImages.length !== 144
    ) {
      throw new Error(
        `画像数が想定と異なります。人形:${dollImages.length}枚、残りの音声なし:${remainingSilentImages.length}枚、音声あり:${audioImages.length}枚。対応表を確認してください。`
      );
    }

    // 画像ファイルの存在確認
    statusText.textContent = "画像を確認しています...";

    for (const item of allImages) {
      const response = await fetch(item.src);

      if (!response.ok) {
        throw new Error(`${item.name} を読み込めません。`);
      }
    }

    // 音声ファイルの存在確認
    statusText.textContent = "音声ファイルを確認しています...";

    const audioNames = [...new Set(
      audioImages.map(item => item.audio)
    )];

    for (const name of audioNames) {
      const response = await fetch(AUDIO_FOLDER + name);

      if (!response.ok) {
        throw new Error(`${name} を読み込めません。`);
      }
    }

    shuffle(dollImages);
    shuffle(remainingSilentImages);
    shuffle(audioImages);

    currentImages = dollImages;
    phase = "doll";
    index = 0;

    createButtons();

    statusText.textContent =
      "";

    experiment.hidden = false;
    showImage();

  } catch (error) {
    statusText.textContent =
      "準備中にエラーが発生しました: " + error.message;

    console.error(error);
  }
}

// 評価ボタンを作る
function createButtons() {
  buttonsDiv.innerHTML = "";

  for (let score = -3; score <= 3; score++) {
    const button = document.createElement("button");

    button.textContent = score > 0 ? `+${score}` : String(score);

    button.addEventListener("click", () => {
      const item = currentImages[index];

      results.push({
        participantId: PARTICIPANT_ID,
        image: item.name,
        score,
        order: results.length + 1,
        phase
      });

      index++;

      if (index < currentImages.length) {
        showImage();
      } else {
        finishPhase();
      }
    });

    buttonsDiv.appendChild(button);
  }
}

// 画像を表示する
function showImage() {
  stopAudio();

  const item = currentImages[index];

  imageEl.src = item.src;

  const phaseNames = {
    doll: "人形・音声なし",
    remainingSilent: "残りの音声なし",
    audio: "音声あり"
  };

  progressText.textContent =
    `${phaseNames[phase]}：${index + 1} / ${currentImages.length} 枚目`;

  const hasAudio = phase === "audio" && Boolean(item.audio);
  speakerIcon.hidden = !hasAudio;

  if (hasAudio) {
    audioTimer = setTimeout(() => {
      const audio = new Audio(AUDIO_FOLDER + item.audio);
      audio.volume = volume;
      currentAudio = audio;

      audio.play()
        .then(() => {
          stopTimer = setTimeout(stopAudio, 1000);
        })
        .catch(error => {
          console.error("音声再生エラー:", error);
          statusText.textContent =
            "";
        });
    }, 500);
  }
}

// 各段階の終了処理
function finishPhase() {
  stopAudio();
  experiment.hidden = true;

  if (phase === "doll") {
    transitionScreen.hidden = false;
    statusText.textContent =
      "最初の144枚が終了しました。次へ進んでください。";
    return;
  }

  if (phase === "remainingSilent") {
    showVolumeScreen();
    return;
  }

  finish();
}

// 中間画面の「次へ」
transitionButton.addEventListener("click", () => {
  transitionScreen.hidden = true;
  phase = "remainingSilent";
  currentImages = remainingSilentImages;
  index = 0;

  experiment.hidden = false;
  statusText.textContent = "スマートスピーカ（音声なし）画像を評価します。";

  showImage();
});

// 音量調整画面を表示
function showVolumeScreen() {
  volumeScreen.hidden = false;

  statusText.textContent =
    "音声なし画像の評価が終了しました。音量を調整してください。次にスマートスピーカー（音声あり）を評価します。";
}

// 音量スライダー
volumeSlider.addEventListener("input", () => {
  volume = Number(volumeSlider.value) / 100;
  volumeValue.textContent = `${volumeSlider.value}%`;
});

// テスト音声を1秒再生
testSoundButton.addEventListener("click", async () => {
  stopAudio();

  const audio = new Audio(AUDIO_FOLDER + "voice001.wav");
  audio.volume = volume;
  currentAudio = audio;

  testSoundButton.disabled = true;
  testSoundButton.textContent = "再生中...";

  try {
    await audio.play();

    stopTimer = setTimeout(() => {
      stopAudio();
      testSoundButton.disabled = false;
      testSoundButton.textContent = "テスト音声を再生";
    }, 1000);

  } catch (error) {
    stopAudio();
    testSoundButton.disabled = false;
    testSoundButton.textContent = "テスト音声を再生";

    statusText.textContent =
      "テスト音声を再生できません。音声ファイルを確認してください。";

    console.error(error);
  }
});

// 音量調整後、音声あり評価へ
continueButton.addEventListener("click", () => {
  stopAudio();

  volumeScreen.hidden = true;
  phase = "audio";
  currentImages = audioImages;
  index = 0;

  experiment.hidden = false;
  statusText.textContent = "音声あり画像の評価を開始します。";

  showImage();
});

// 全評価終了後に送信
async function finish() {
  stopAudio();
  experiment.hidden = true;
  volumeScreen.hidden = true;
  transitionScreen.hidden = true;

  statusText.textContent = "回答を送信しています...";

  const payload = results.map(row => ({
    participantId: row.participantId,
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


