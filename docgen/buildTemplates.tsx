import { glob } from "glob";
import { join, relative, dirname, basename, resolve } from "path";
import { build } from "tsup";
import { renderPreview } from "./renderPreview";
import React from "react";
import remarkFrontmatter from "remark-frontmatter";
import frontmatter from "front-matter";
import { promises as fs } from "fs";
import { formatCamelCaseToTitle, formatSnippet } from "./utils";

const tmpDir = join(__dirname, "../.tmp");

export async function buildTemplates() {
  const { default: mdx } = await import("@mdx-js/esbuild");

  const templates = await glob(join(__dirname, "../src/ui/**/*.mdx"));

  return await Promise.all(
    templates.map(async (template) => {
      const outPath =
        join(
          tmpDir,
          dirname(relative(join(__dirname, "../src"), template)),
          basename(template, ".mdx")
        ) + ".js";

      const docLocation = join(
        __dirname,
        `../docs/${dirname(
          relative(join(__dirname, "../src"), template)
        )}/${basename(template)}`
      );

      await build({
        entry: [template],
        esbuildPlugins: [
          mdx({
            remarkPlugins: [remarkFrontmatter],
            providerImportSource: "@onedoc/react-print/mdx",
          }),
        ],
        dts: false,
        outDir: dirname(outPath),
        format: "cjs",
        sourcemap: false,
        splitting: false,
        bundle: true,
        config: false,
        clean: true,
      });

      const { default: Component } = await import(outPath);

      const RealComponent = Component.default ? Component.default : Component;

      const { attributes, body } = frontmatter<{
        title?: string;
        description?: string;
        icon?: string;
        category?: string;
      }>(
        await fs
          .readFile(template, {
            encoding: "utf-8",
          })
          .then((file) => file.toString())
      );

      const paths = await renderPreview(
        <RealComponent />,
        `${dirname(relative(join(__dirname, "../src"), template)).replace(
          /\//g,
          " "
        )} ${basename(outPath, ".js")}`,
        docLocation,
        false
      );

      const name =
        attributes.title || formatCamelCaseToTitle(basename(template, ".mdx"));

      let markdown = `---
title: ${name}
${attributes.icon ? `icon: ${attributes.icon}` : ""}
category: ${attributes.category || "Uncategorized"}
---\n\n`;

      markdown += `<Frame type="glass"><img src="${paths.imagePath}" style={{ maxHeight: '600px', borderRadius: "0.25rem", overflow: "hidden" }} /></Frame>\n\n`;

      markdown += `\`\`\`jsx
${await formatSnippet(body)}
\`\`\`\n\n`;

      return {
        name,
        icon: attributes.icon,
        category: attributes.category,
        path: relative(join(__dirname, "../src"), template)
          .toLowerCase()
          .replace(/\.mdx$/, ""),
        image: resolve(docLocation, paths.imagePath),
        outputPath: docLocation,
        markdown,
      };
    })
  );
}

export const buildTemplateList = async (
  templates: Awaited<ReturnType<typeof buildTemplates>>,
  path: string
) => {
  let markdown = `---
title: Browse
icon: list
---\n\n`;

  // Group templates by category
  const categories: {
    [key: string]: Awaited<ReturnType<typeof buildTemplates>>[0][];
  } = templates.reduce((acc, template) => {
    const category = template.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  // Generate markdown for each category
  Object.entries(categories).forEach(([category, templates]) => {
    markdown += `## ${category}\n\n<CardGroup>\n`;

    templates.forEach((template) => {
      markdown += ` <Card title="${template.name}" href="${relative(
        path,
        template.path
      )}">
      <div style={{ marginTop: "1rem", borderRadius: "0.25rem", overflow: "hidden" }}>
        <img src="${relative(path, template.image)}"/>
      </div>
    </Card>\n`;
    });

    markdown += `</CardGroup>\n\n`;
  });

  return markdown;
};
