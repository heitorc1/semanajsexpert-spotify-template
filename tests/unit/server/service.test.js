import { jest, expect, describe, test, beforeEach } from "@jest/globals";
import config from "../../../server/config";
import { Service } from "../../../server/service";
import TestUtil from "../_util/testUtil";
import fs from "fs";
import fsPromises from "fs/promises";

const {
  pages,
  dir: { publicDirectory },
} = config;

describe("#Service - test site for service class", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("#createFileStream", async () => {
    const currentReadable = TestUtil.generateReadableStream(["teste"]);

    jest.spyOn(fs, fs.createReadStream.name).mockReturnValue(currentReadable);

    const service = new Service();
    const myFile = "file.mp3";
    const result = service.createFileStream(myFile);

    expect(result).toStrictEqual(currentReadable);
    expect(fs.createReadStream).toHaveBeenCalledWith(myFile);
  });

  test("#getFIleInfo", async () => {
    jest.spyOn(fsPromises, fsPromises.access.name).mockResolvedValue();

    const currentSong = "mySong.mp3";
    const service = new Service();
    const result = await service.getFileInfo(currentSong);
    const expectedResult = {
      type: ".mp3",
      name: `${publicDirectory}\\${currentSong}`,
    };
    expect(result).toStrictEqual(expectedResult);
  });

  test("getFileStream - should return a file stream", async () => {
    const mockReadableStream = TestUtil.generateReadableStream(["data"]);
    const currentSong = "song.mp3";
    const currentSongFullPath = `${publicDirectory}/${currentSong}`;

    const fileInfo = {
      type: ".mp3",
      name: currentSongFullPath,
    };

    jest
      .spyOn(Service.prototype, Service.prototype.getFileInfo.name)
      .mockResolvedValue(fileInfo);

    jest
      .spyOn(Service.prototype, Service.prototype.createFileStream.name)
      .mockReturnValue(mockReadableStream);

    const service = new Service();
    const result = await service.getFileStream(currentSong);
    const expectedResult = {
      type: fileInfo.type,
      stream: mockReadableStream,
    };

    expect(result).toStrictEqual(expectedResult);
    expect(service.createFileStream).toHaveBeenCalledWith(fileInfo.name);
    expect(service.getFileInfo).toHaveBeenCalledWith(currentSong);
  });
});
