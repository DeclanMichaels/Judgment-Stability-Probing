#!/usr/bin/env python3
"""Convert markdown paper to PDF via HTML + WeasyPrint.

Usage: python3 render_html_pdf.py [input.md] [output.pdf]
Defaults: rcp-v2-full-paper-draft.md -> rcp-v2-full-paper-draft.pdf

Requires: pip install weasyprint markdown
"""
import markdown
import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))

input_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(script_dir, "rcp-v2-full-paper-draft.md")
output_pdf = sys.argv[2] if len(sys.argv) > 2 else input_file.replace(".md", ".pdf")
output_html = input_file.replace(".md", ".html")

with open(input_file, "r", encoding="utf-8") as f:
    md_text = f.read()

html_body = markdown.markdown(
    md_text,
    extensions=["tables", "toc", "attr_list", "md_in_html"],
    output_format="html5"
)

html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@page {{
    size: letter;
    margin: 1in 1in 1in 1in;
    @bottom-center {{
        content: counter(page);
        font-family: "Times New Roman", Times, serif;
        font-size: 10pt;
    }}
}}
body {{
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    text-align: justify;
    color: #000;
    orphans: 3;
    widows: 3;
}}
h1 {{
    font-size: 18pt;
    font-weight: bold;
    text-align: center;
    margin-top: 0.5in;
    margin-bottom: 0.3in;
    page-break-after: avoid;
}}
h2 {{
    font-size: 14pt;
    font-weight: bold;
    margin-top: 0.4in;
    margin-bottom: 0.15in;
    page-break-after: avoid;
}}
h3 {{
    font-size: 12pt;
    font-weight: bold;
    margin-top: 0.3in;
    margin-bottom: 0.1in;
    page-break-after: avoid;
}}
h4 {{
    font-size: 12pt;
    font-weight: bold;
    font-style: italic;
    margin-top: 0.2in;
    margin-bottom: 0.1in;
    page-break-after: avoid;
}}
p {{
    margin-top: 0;
    margin-bottom: 0.5em;
    text-indent: 0;
}}
table {{
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 10pt;
    page-break-inside: avoid;
}}
th, td {{
    border: 1px solid #444;
    padding: 4px 8px;
    text-align: left;
}}
th {{
    background-color: #f0f0f0;
    font-weight: bold;
}}
blockquote {{
    margin: 1em 0.5in;
    padding-left: 0.2in;
    border-left: 2px solid #999;
    font-style: italic;
}}
hr {{
    border: none;
    border-top: 1px solid #999;
    margin: 1.5em 0;
}}
a {{
    color: #1a0dab;
    text-decoration: underline;
}}
code {{
    font-family: "Courier New", Courier, monospace;
    font-size: 10pt;
    background-color: #f5f5f5;
    padding: 1px 3px;
}}
pre {{
    font-family: "Courier New", Courier, monospace;
    font-size: 9pt;
    background-color: #f5f5f5;
    padding: 0.5em;
    border: 1px solid #ddd;
    white-space: pre-wrap;
    page-break-inside: avoid;
}}
img {{
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1em auto;
    page-break-inside: avoid;
}}
</style>
</head>
<body>
{html_body}
</body>
</html>
"""

with open(output_html, "w", encoding="utf-8") as f:
    f.write(html_doc)
print(f"HTML: {output_html}")

from weasyprint import HTML
HTML(filename=output_html).write_pdf(output_pdf)
print(f"PDF:  {output_pdf}")
