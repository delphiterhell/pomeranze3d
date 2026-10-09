module.exports = function (eleventyConfig) {
  // Passthrough: static assets
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("models");
  eleventyConfig.addPassthroughCopy("admin");

  // Passthrough: static HTML pages (non toccate da Eleventy)
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("chi-sono.html");
  eleventyConfig.addPassthroughCopy("prodotti.html");
  eleventyConfig.addPassthroughCopy("contatti.html");

  // Filtro Netlify Image CDN: CDN su Netlify, path diretto in locale
  eleventyConfig.addFilter("imgCDN", function (src, width = 1600, quality = 82) {
    if (!src) return src;
    if (process.env.NETLIFY) {
      return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}&q=${quality}&fm=webp`;
    }
    return src;
  });

  // Filtro data in italiano
  eleventyConfig.addFilter("dataItaliana", function (date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  // Ordina articoli blog dal più recente
  eleventyConfig.addCollection("blog", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/blog/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Ordina workshop per data
  eleventyConfig.addCollection("workshop", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/workshop/*.md")
      .sort((a, b) => a.date - b.date);
  });

  return {
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: "njk",
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
