import { config } from "dotenv";

import { Onedoc } from "@onedoc/client";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import { fromBuffer } from "pdf2pic";
import { glob } from "glob";
import { type CompileOptions, compile } from "../src/compile/compile";
import { CSS } from "../src/CSS/css";
import React from "react";

config({ path: ".env.local" });
config();

const onedoc = new Onedoc(process.env.ONEDOC_API_KEY!);

export const baseCss = fs.readFileSync(path.join(__dirname, "./base.css"));
export const indexCss = fs.readFileSync(
  path.join(__dirname, "../dist/index.css")
);

export async function renderPreview(
  component: React.ReactElement,
  componentName: string,
  outputPath: string,
  useBaseCss: boolean = true,
  compileOptions?: CompileOptions
) {
  const Component = component;
  const Element = <>{Component}</>;

  const html = (await compile(Element, compileOptions)) as string;

  const hash = crypto.createHash("sha256");
  hash.update(html);

  let id = hash.digest("hex");
  id = componentName.replace(/ /g, "-").toLowerCase() + "-" + id.slice(0, 8);

  const targetFolder = path.join(__dirname, `../docs/images/previews/${id}/`);

  // If the file doesn't exist, create it by generating the document with Onedoc
  if (!fs.existsSync(targetFolder)) {
    const { file, info, error } = await onedoc.render({
      html,
      assets: [
        ...(useBaseCss
          ? [
              {
                path: "base.css",
                content: baseCss,
              },
            ]
          : [
              {
                path: "default.css",
                content: Buffer.from(`@page { size: A4; }`),
              },
            ]),
        {
          path: "index.css",
          content: indexCss,
        },
      ],
      save: false,
      test: false,
    });

    if (error) {
      throw new Error(`Error rendering the document: ${error}`);
    }

    // Create the directory
    fs.mkdirSync(targetFolder, { recursive: true });

    // Write the HTML to a file
    fs.writeFileSync(path.join(targetFolder, "index.html"), html);

    const buffer = Buffer.from(file);

    // Save the buffer to a file called id.pdf
    fs.writeFileSync(path.join(targetFolder, "document.pdf"), buffer);

    const pdf2pic = fromBuffer(buffer, {
      density: 300,
      saveFilename: "document",
      savePath: targetFolder,
      format: "jpg",
      preserveAspectRatio: true,
      width: 1920,
    });

    let currentPage = 1;

    while (true) {
      try {
        await pdf2pic(currentPage);
      } catch (e) {
        break;
      }

      currentPage++;
    }
  }

  const pages = (await glob(path.join(targetFolder, "*.jpg"))).sort();
  const pdf = await glob(path.join(targetFolder, "*.pdf"));
  const imagePath = path.relative(path.dirname(outputPath), pages[0]);
  const pdfPath = path.relative(path.dirname(outputPath), pdf[0]);

  return {
    imagePath,
    pdfPath,
  };
}
