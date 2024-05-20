---
title: AI Tube Clap Exporter
emoji: 🍿🤖
colorFrom: red
colorTo: blue
sdk: docker
pinned: false
app_port: 3000
---

Export a full .clap (with all its assets already in) to a video

# Installation

It is important that you make sure to use the correct version of Node (Node 20)

1. `nvm use`
2. `npm i`
3. clone `.env` to `.env.local`
4. edit `.env.local` to define the secrets / api access keys
5. `npm run start`

# Testing the Docker image

Note: you need to install Docker, and it needs to be already running.

You will also need to build it for *your* architecture.

```bash
docker build --platform linux/arm64 -t ai-tube-clap-exporter .
docker run -it -p 7860:7860 ai-tube-clap-exporter
```

# Architecture

AI Channels are just Hugging Face datasets.

For now, we keep everything into one big JSON index, but don't worry we can migrate this to something more efficient, such as Redis (eg. using Upstash for convenience).