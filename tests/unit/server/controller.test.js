import { jest, expect, describe, test, beforeEach } from "@jest/globals";
import config from "../../../server/config";
import { Controller } from "../../../server/controller";
import { Service } from "../../../server/service";
import TestUtil from "../_util/testUtil";

const { pages } = config;

describe("#Controller - test site for controller class", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("getFileStream - should return a file stream", async () => {
    const controller = new Controller();
    const mockFileStream = TestUtil.generateReadableStream(["data"]);
    const mockType = ".html";
    const mockFileName = "index.html";

    const getFileStream = jest
      .spyOn(Service.prototype, Service.prototype.getFileStream.name)
      .mockResolvedValue({
        stream: mockFileStream,
        type: mockType,
      });

    const { stream, type } = await controller.getFileStream(mockFileName);

    expect(stream).toStrictEqual(mockFileStream);
    expect(type).toStrictEqual(mockType);
  });
});
