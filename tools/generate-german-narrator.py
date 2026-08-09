# pyright: reportMissingImports=false
# /// script
# requires-python = ">=3.11"
# dependencies = ["edge-tts==7.2.8"]
# ///
"""Regenerate the bundled German narrator clips from the reviewed script."""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
AUDIO_ROOT = ROOT / "ui-vue" / "src" / "assets" / "audio"
SCRIPT_PATH = AUDIO_ROOT / "scripts.de.json"
OUTPUT_DIR = AUDIO_ROOT / "de"


async def save_with_retry(text: str, voice: str, target: Path) -> None:
    for attempt in range(1, 5):
        try:
            target.unlink(missing_ok=True)
            await edge_tts.Communicate(
                text=text,
                voice=voice,
                rate="-5%",
                pitch="-2Hz",
            ).save(target)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 4:
                raise
            await asyncio.sleep(2**attempt)


async def synthesize() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to normalize and encode narrator clips")

    config = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    voice = config["voice"]
    clips: dict[str, str] = config["clips"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="werewolves-narrator-") as temp_dir:
        temp = Path(temp_dir)
        normalized = temp / "normalized"
        normalized.mkdir()
        for key, text in clips.items():
            source = temp / f"{key}.mp3"
            target = normalized / f"{key}.mp3"
            await save_with_retry(text, voice, source)
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(source),
                    "-af",
                    "loudnorm=I=-18:LRA=7:TP=-1.5",
                    "-ar",
                    "44100",
                    "-ac",
                    "1",
                    "-codec:a",
                    "libmp3lame",
                    "-b:a",
                    "128k",
                    str(target),
                ],
                check=True,
            )
            print(f"prepared {key}.mp3")
            await asyncio.sleep(0.5)

        for key in clips:
            target = OUTPUT_DIR / f"{key}.mp3"
            shutil.copy2(normalized / f"{key}.mp3", target)
            print(f"generated {target.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(synthesize())
