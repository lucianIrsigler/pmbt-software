import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Thandi")).toBe("Thandi");
    expect(csvCell(450)).toBe("450");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Botha, Annelie")).toBe('"Botha, Annelie"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+27821234567")).toBe("'+27821234567");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // Numbers are numbers, not text a person typed.
    expect(csvCell(-1)).toBe("-1");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and starts with a BOM", () => {
    expect(
      toCsv([
        ["a", "b"],
        [1, "x,y"],
      ]),
    ).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
