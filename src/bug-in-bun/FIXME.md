We should use import .... from "@aitube/ffmpeg"

But there is a bug with Bun:

https://github.com/oven-sh/bun/issues/4477


Once fixed, we can delete aitube_ffmpeg (and the dependencies like fluent-ffmpeg, puppeteer etc)

and only use @aitube/ffmpeg