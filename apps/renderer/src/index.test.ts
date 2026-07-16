import { readFile, writeFile, access } from "node:fs/promises";
import { limits } from "@hypergendoc/config";
import { describe, expect, it } from "vitest";
import type { Compiler, RendererRequest } from "./index.js";
import {
  TexCompiler,
  tectonicArgs,
  tectonicEnvironment,
  render,
} from "./index.js";

const style = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Inter",
  bodySizePt: 11,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#111111",
    heading: "#222222",
    primary: "#123456",
    accent: "#654321",
    muted: "#777777",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
} as const;
const request: RendererRequest = {
  protocol: "hypergendoc-render-v1",
  requestId: "11111111-1111-4111-8111-111111111111",
  body: "Hello",
  style,
};

describe("renderer worker", () => {
  it("uses the pinned Tectonic offline/untrusted argv and isolated environment", () => {
    expect(tectonicArgs("/work/document.tex", "/work")).toEqual([
      "-X",
      "compile",
      "--only-cached",
      "--untrusted",
      "--outdir",
      "/work",
      "/work/document.tex",
    ]);
    expect(tectonicEnvironment("/work", "/cache")).toEqual({
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: "/work",
      TMPDIR: "/work",
      TECTONIC_CACHE_DIR: "/cache",
      SOURCE_DATE_EPOCH: "0",
      LANG: "C.UTF-8",
    });
  });
  it("reports an unavailable compiler without attempting a render", async () => {
    await expect(
      new TexCompiler("/definitely-not-a-tectonic-binary").compile(
        "/work/document.tex",
        "/work",
        1,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("uses an injected compiler, hashes exact source, and removes its workspace", async () => {
    let sourcePath = "";
    const compiler: Compiler = {
      async compile(path, workspace) {
        sourcePath = path;
        expect(await readFile(path, "utf8")).toContain("\\begin{document}");
        await writeFile(`${workspace}/document.pdf`, "%PDF-1.4\nfixture");
      },
    };
    const result = await render(request, compiler);
    expect(result).toMatchObject({ ok: true, requestId: request.requestId });
    await expect(access(sourcePath)).rejects.toThrow();
  });
  it("returns safe errors without a TeX binary or compiler transcript", async () => {
    const compiler: Compiler = {
      compile() {
        return Promise.reject(
          Object.assign(new Error("/secret/path --command"), {
            code: "unavailable",
          }),
        );
      },
    };
    expect(await render(request, compiler)).toEqual(
      expect.objectContaining({ ok: false, error: "dependency_unavailable" }),
    );
  });
  it("rejects oversized output and removes its workspace", async () => {
    let sourcePath = "";
    const compiler: Compiler = {
      async compile(path, workspace) {
        sourcePath = path;
        await writeFile(
          `${workspace}/document.pdf`,
          Buffer.alloc(limits.renderedArtifactBytes + 1),
        );
      },
    };
    expect(await render(request, compiler)).toEqual(
      expect.objectContaining({ error: "render_output_limit" }),
    );
    await expect(access(sourcePath)).rejects.toThrow();
  });

  it("cleans up after a timeout-class compiler failure", async () => {
    let sourcePath = "";
    const compiler: Compiler = {
      compile(path) {
        sourcePath = path;
        return Promise.reject(
          Object.assign(new Error("timeout"), { code: "timeout" }),
        );
      },
    };
    expect(await render(request, compiler)).toEqual(
      expect.objectContaining({ error: "render_timeout" }),
    );
    await expect(access(sourcePath)).rejects.toThrow();
  });
  it("rejects malformed and hostile bodies before invoking the compiler", async () => {
    const compiler: Compiler = {
      compile() {
        return Promise.reject(new Error("must not run"));
      },
    };
    expect(
      await render({ ...request, body: "\\input{/etc/passwd}" }, compiler),
    ).toEqual(expect.objectContaining({ error: "render_rejected" }));
  });
});
