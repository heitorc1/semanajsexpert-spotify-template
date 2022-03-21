import fs from "fs";
import fsPromises from "fs/promises";
import { randomUUID } from "crypto";
import config from "./config.js";
import path, { join, extname } from "path";
import { PassThrough, Writable } from "stream";
import { once } from "events";
import streamsPromises from "stream/promises";
import Throttle from "throttle";
import childProcess from "child_process";
import { logger } from "./util.js";

const {
  dir: { publicDirectory, fxDirectory },
  constants: {
    fallbackBitRate,
    englishConversation,
    bitRateDivisor,
    audioMediaType,
    songVolume,
    fxVolume,
  },
} = config;

export class Service {
  constructor() {
    this.clientStreams = new Map();
    this.currentSong = englishConversation;
    this.currentBitRate = 0;
    this.throttleTransform = {};
    this.currentReadable = {};
  }

  createClientStream() {
    const id = randomUUID();
    const clientStream = new PassThrough();
    this.clientStreams.set(id, clientStream);

    return {
      id,
      clientStream,
    };
  }

  removeClientStream(id) {
    this.clientStreams.delete(id);
  }

  _executeSoxCommand(args) {
    return childProcess.spawn("sox", args);
  }

  async getBitRate(song) {
    try {
      const args = [
        "--i", // info
        "-B", // bitrate
        song,
      ];
      const {
        stderr, // tudo que é erro
        stdout, // tudo que é log
        // stdin, // enviar dados
      } = this._executeSoxCommand(args);
      await Promise.all([once(stdout, "readable"), once(stderr, "readable")]);

      const [success, error] = [stdout, stderr].map((stream) => stream.read());
      if (error) return await Promise.reject();

      return success.toString().trim().replace(/k/, "000");
    } catch (error) {
      logger.error(`problema no bitrate: ${error}`);
      return fallbackBitRate;
    }
  }

  broadCast() {
    return new Writable({
      write: (chunk, enc, cb) => {
        for (const [id, stream] of this.clientStreams) {
          // se o cliente desconectou não devemos mais manda dados pra ele
          if (stream.writableEnded) {
            this.clientStreams.delete(id);
            continue;
          }
          stream.write(chunk);
        }

        cb();
      },
    });
  }

  async startStreaming() {
    logger.info(`starting with ${this.currentSong}`);
    const resolvedBitRate = await this.getBitRate(this.currentSong);
    const bitRate = resolvedBitRate / bitRateDivisor;
    this.currentBitRate = bitRate;

    const throttleTransform = new Throttle(bitRate);
    this.throttleTransform = throttleTransform;

    const songReadable = this.createFileStream(this.currentSong);
    this.currentReadable = songReadable;

    return streamsPromises.pipeline(
      songReadable,
      throttleTransform,
      this.broadCast()
    );
  }

  stopStreaming() {
    this.throttleTransform?.end?.();
  }

  createFileStream(filename) {
    return fs.createReadStream(filename);
  }

  async getFileInfo(file) {
    const fullFilePath = join(publicDirectory, file);
    // valida se existe, se não existe dá erro
    await fsPromises.access(fullFilePath);
    const fileType = extname(fullFilePath);
    return {
      name: fullFilePath,
      type: fileType,
    };
  }

  async getFileStream(file) {
    const { name, type } = await this.getFileInfo(file);
    return {
      stream: this.createFileStream(name),
      type,
    };
  }

  async readFxByName(fxName) {
    const songs = await fsPromises.readdir(fxDirectory);
    const chosenSong = songs.find((filename) =>
      filename.toLowerCase().includes(fxName)
    );
    if (!chosenSong) return Promise.reject(`the song ${fxName} wasn't found`);

    return path.join(fxDirectory, chosenSong);
  }

  appendFxStream(fx) {
    const throttleTransformable = new Throttle(this.currentBitRate);
    streamPromises.pipeline(throttleTransformable, this.broadCast());

    const unpipe = () => {
      const transformStream = this.mergeAudioStreams(fx, this.currentReadable);

      this.throttleTransform = throttleTransformable;
      this.currentReadable = transformStream;
      this.currentReadable.removeListener("unpipe", unpipe);

      streamPromises.pipeline(transformStream, throttleTransformable);
    };
    this.throttleTransform.on("unpipe", unpipe);
    this.throttleTransform.pause();
    this.currentReadable.unpipe(this.throttleTransform);
  }

  mergeAudioStreams(song, readable) {
    const transformStream = PassThrough();
    const args = [
      "-t",
      audioMediaType,
      "-v",
      songVolume,
      "-m",
      "-", // - é para receber como stream
      "-t",
      audioMediaType,
      "-v",
      fxVolume,
      song,
      "-t",
      audioMediaType,
      "-",
    ];

    const { stdout, stdin } = this._executeSoxCommand(args);

    streamPromises
      .pipeline(readable, stdin)
      .catch((error) =>
        logger.error(`error on sending stream to sox: ${error}`)
      );

    streamPromises
      .pipeline(stdout, transformStream)
      .catch((error) =>
        logger.error(`error on receiving stream from sox: ${error}`)
      );

    return transformStream;
  }
}
