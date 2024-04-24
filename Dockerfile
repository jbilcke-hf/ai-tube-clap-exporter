# And Node 20
FROM node:20-alpine

ARG DEBIAN_FRONTEND=noninteractive

RUN apk update

RUN apk add alpine-sdk pkgconfig

# For FFMPEG and gl concat
RUN apk add curl python3 python3-dev libx11-dev libsm-dev libxrender libxext-dev mesa-dev xvfb libxi-dev glew-dev

# For Puppeteer
RUN apk add build-base gcompat udev ttf-opensans chromium

RUN apk add ffmpeg

# Set up a new user named "user" with user ID 1000
RUN adduser --disabled-password --uid 1001 user

# Switch to the "user" user
USER user

# Set home to the user's home directory
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

# Set the working directory to the user's home directory
WORKDIR $HOME/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY --chown=user package*.json $HOME/app

# make sure the .env is copied as well
COPY --chown=user .env $HOME/app

RUN ffmpeg -version

RUN npm install

# Copy the current directory contents into the container at $HOME/app setting the owner to the user
COPY --chown=user . $HOME/app

EXPOSE 7860

# we can't use this (it time out)
# CMD [ "xvfb-run", "-s", "-ac -screen 0 1920x1080x24", "npm", "run", "start" ]
CMD [ "npm", "run", "start" ]