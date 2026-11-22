// Where the About tab sends a reader: the README in their language.

/** README translations beside the English README.md, by UI language. */
export const README_TRANSLATIONS: Readonly<Record<string, string>> = {
  "zh-CN": "README.zh-CN.md",
  "zh-TW": "README.zh-TW.md",
};

/**
 * The project's README for `language`. The English one is the repository's
 * front page; a translation opens as its own file on `main`. Release packages
 * carry only the English README, so the translations are read on GitLab.
 */
export function readmeUrl(repository: string, language: string): string {
  const file = README_TRANSLATIONS[language];
  return file ? `${repository}/-/blob/main/${file}#creamdeck` : `${repository}#creamdeck`;
}
