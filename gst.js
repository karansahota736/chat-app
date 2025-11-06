const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const fetch = require("node-fetch");
const path = require("path");
const readline = require("readline");

// Replace with your OpenAI Whisper API key
const OPENAI_API_KEY = "your_openai_api_key";

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function transcribeAudio(filePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) throw new Error("Whisper transcription failed");

  const data = await response.json();
  return data.text.replace(/\D/g, "").substring(0, 6);
}

async function fetchGSTDetails(gstin) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto("https://services.gst.gov.in/services/searchtp", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("#for_gstin");
    await page.type("#for_gstin", gstin, { delay: 100 });
    await sleep(3000); // Wait for CAPTCHA to appear

    // Click the audio button
    const voiceBtn = await page.$("button[ng-click='play()']");
    if (!voiceBtn) throw new Error("Voice CAPTCHA button not found");

    await voiceBtn.click();
    await sleep(3000); // Wait for audio to load

    // Find the audio URL
    const audioUrl = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.src : null;
    });

    if (!audioUrl) throw new Error("Audio CAPTCHA URL not found");

    // Download the MP3 file
    const audioResponse = await axios.get(audioUrl, { responseType: "stream" });
    const mp3Path = path.join(__dirname, "captcha.mp3");
    const wavPath = path.join(__dirname, "captcha.wav");

    const writer = fs.createWriteStream(mp3Path);
    audioResponse.data.pipe(writer);
    await new Promise((resolve) => writer.on("finish", resolve));

    // Convert MP3 to WAV
    await new Promise((resolve, reject) => {
      ffmpeg(mp3Path)
        .toFormat("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(wavPath);
    });

    // Transcribe using Whisper
    const captchaText = await transcribeAudio(wavPath);
    console.log("🔍 CAPTCHA from audio:", captchaText);

    // Fill the captcha
    await page.type("#fo-captcha", captchaText, { delay: 100 });
    await page.click("#lotsearch");

    await page.waitForSelector("#lottable", { timeout: 20000 });

    // Extract GST data
    const data = await page.evaluate(() => {
      const textFrom = (selector) =>
        document.querySelector(selector)?.innerText.trim() || "";

      return {
        gstin: textFrom(".tbl-format h4"),
        legalName: textFrom(".tbl-format .row:nth-child(1) .col-sm-4:nth-child(1) p:nth-child(2)"),
        tradeName: textFrom(".tbl-format .row:nth-child(1) .col-sm-4:nth-child(2) p:nth-child(2)"),
        registrationDate: textFrom(".tbl-format .row:nth-child(1) .col-sm-4:nth-child(3) p:nth-child(2)"),
        constitution: textFrom(".tbl-format .row:nth-child(2) .col-sm-4:nth-child(1) p:nth-child(2)"),
        status: textFrom(".tbl-format .row:nth-child(2) .col-sm-4:nth-child(2) p:nth-child(2)"),
        taxpayerType: textFrom(".tbl-format .row:nth-child(2) .col-sm-4:nth-child(3) p:nth-child(2)"),
        principalPlace: textFrom(".tbl-format .row:nth-child(3) .col-sm-4:nth-child(3) p.wordCls"),
      };
    });

    console.log("✅ GST Data:\n", data);
  } catch (error) {
    console.error("❌ Error fetching GST details:", error);
  } finally {
    await browser.close();
  }
}

const gstin = process.argv[2] || "03AAWFP9900G1ZY";
fetchGSTDetails(gstin);
