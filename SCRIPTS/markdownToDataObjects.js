const fs = require("fs");
const fetch = require("node-fetch");
const secrets = require("../secrets");

function writeFile(filename, contents) {
  fs.writeFile(filename, contents, function cb(err) {
    if (err) {
      throw err;
    }
  });
}

function convertMarkdownToObjects(contents) {
  return contents.map((line) => {
    const [_, rawTitle, url] = line.match(/\[(.*)]\((.*)\)$/);
    const [__, annotations] = rawTitle.match(/\((.*)\)/) || [];
    const urlMatch = url.match(/https:\/\/www\.imdb\.com\/title\/(.*)\/.*/);
    const [___, imdbId] = urlMatch || [];

    if (!urlMatch) {
      console.log("NO IMDB ID!", line);
    }

    let title = rawTitle;
    if (annotations) {
      title = rawTitle.replace(`(${annotations})`, "");
    }

    return {
      title: title.trim(),
      annotations: annotations?.trim(),
      imdbId: imdbId,
      imdbUrl: url,
    };
  });
}

function run() {
  const [_nodeBin, _scriptFile, rawTargetFile] = process.argv;
  const targetFile = `./DATA/RAW/${rawTargetFile}`;

  if (!rawTargetFile || !fs.existsSync(targetFile)) {
    console.log("NO SUCH FILE IN `./DATA/RAW`");
    return;
  }

  const tags = [];
  if (rawTargetFile.toLowerCase().match("childhood")) {
    tags.push("childhood");
  }

  const contents = fs.readFileSync(targetFile).toString().split("\n");

  const output = convertMarkdownToObjects(contents);

  const fetchPromises = [];

  output.forEach((fromMarkdown) => {
    const { imdbId } = fromMarkdown;
    const targetCacheFile = `./DATA/CACHED/${imdbId}.js`;

    if (imdbId && !fs.existsSync(targetCacheFile)) {
      const omdbPromise = fetch(
        `http://www.omdbapi.com/?i=${imdbId}&apikey=${secrets.omdbKey}`
      )
        .then(
          (res) => {
            return res.json();
          },
          (e) => {
            console.log("FAILED to fetch omdb Data", fromMarkdown);
            console.log(e);
          }
        )
        .then((res) => {
          // Note: Should have just saved as json instead of a module
          writeFile(
            targetCacheFile,
            `module.exports = ${JSON.stringify(res)};`
          );
        });

      fetchPromises.push(omdbPromise);
    }
  });

  Promise.all(fetchPromises).then(async () => {
    const outPutWithImdbData = output.map((item) => {
      let imdbData;
      const cacheName = `./DATA/CACHED/${item.imdbId}.js`;
      if (fs.existsSync(cacheName)) {
        const d = fs.readFileSync(cacheName).toString();
        // Saved these files as modules instead of plain json, so have to decode
        imdbData = JSON.parse(d.match(/{.*}/)[0]);
      }

      return { ...item, tags, imdbData };
    });

    writeFile(
      `./DATA/OUTPUT/${rawTargetFile.replace(".txt", ".js")}`,
      `module.exports = ${JSON.stringify(outPutWithImdbData)};`,
    );
  });
}

// run();

function copyToPersonalWebsite() {
  const childhoodShows = require("../DATA/OUTPUT/tvFromChildhood");
  const adulthoodShows = require("../DATA/OUTPUT/tvFromAdulthood");

  const combined = [...childhoodShows, ...adulthoodShows];

  writeFile(
    "../masonjenningsIOv2/src/DATA/tvWatched.js",
    `module.exports = ${JSON.stringify(combined)};`
  );
}

copyToPersonalWebsite();
