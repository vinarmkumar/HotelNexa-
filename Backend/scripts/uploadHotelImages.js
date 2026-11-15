const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const projectRoot = path.resolve(__dirname, "../..");
const frontendRoot = path.join(projectRoot, "Frontend", "hotelnexa");
const sourceRoot = path.join(frontendRoot, "src");
const manifestPath = path.join(sourceRoot, "HomePage", "cloudinaryAssetManifest.json");
const assetDirectories = ["Hotels", "ALLBEDTYPES"];

function getCloudinaryCredentials() {
  const credentials = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing Cloudinary configuration: ${missing.join(", ")}.`);
  }
  return credentials;
}

function signUploadParameters(parameters, apiSecret) {
  const signedValues = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${signedValues}${apiSecret}`).digest("hex");
}

async function findImageFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findImageFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }));
  return nestedFiles.flat();
}

async function uploadImage(filePath, credentials) {
  const assetPath = path.relative(sourceRoot, filePath).replace(/\\/g, "/");
  const assetDirectory = path.posix.dirname(assetPath);
  const cloudFolder = `HotelNexa/${assetDirectory}`;
  const publicId = path.basename(filePath, path.extname(filePath));
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = {
    folder: cloudFolder,
    overwrite: "true",
    public_id: publicId,
    timestamp: String(timestamp),
  };
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(filePath)]), path.basename(filePath));
  form.append("api_key", credentials.apiKey);
  Object.entries(parameters).forEach(([key, value]) => form.append(key, value));
  form.append("signature", signUploadParameters(parameters, credentials.apiSecret));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(60_000) },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.secure_url) {
    const message = String(result?.error?.message || `HTTP ${response.status}`).replace(/[\r\n]/g, " ");
    throw new Error(`Cloudinary upload failed for ${assetPath}: ${message}`);
  }

  const optimizedUrl = result.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
  const validation = await fetch(optimizedUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(30_000),
  });
  if (!validation.ok) {
    throw new Error(`Cloudinary image URL verification failed for ${assetPath} (HTTP ${validation.status}).`);
  }

  return [assetPath, optimizedUrl];
}

async function main() {
  const credentials = getCloudinaryCredentials();
  const sourceDirectories = assetDirectories.map((name) => path.join(sourceRoot, name));
  const directoryChecks = await Promise.all(sourceDirectories.map((directory) => fs.stat(directory)));
  if (directoryChecks.some((stat) => !stat.isDirectory())) {
    throw new Error("Expected Hotels and ALLBEDTYPES asset directories.");
  }

  const imageFiles = (await Promise.all(sourceDirectories.map(findImageFiles))).flat().sort();
  if (imageFiles.length !== 30) {
    throw new Error(`Expected 30 hotel and bed images; found ${imageFiles.length}. No local files were changed.`);
  }

  const manifest = {};
  for (const filePath of imageFiles) {
    const [assetPath, cloudinaryUrl] = await uploadImage(filePath, credentials);
    manifest[assetPath] = cloudinaryUrl;
    console.log(`Uploaded and verified ${assetPath}`);
  }

  const hotelImageCount = Object.keys(manifest).filter((assetPath) => assetPath.startsWith("Hotels/")).length;
  const bedImageCount = Object.keys(manifest).filter((assetPath) => assetPath.startsWith("ALLBEDTYPES/")).length;
  if (hotelImageCount !== 10 || bedImageCount !== 20) {
    throw new Error(`Unexpected manifest totals: ${hotelImageCount} hotel images and ${bedImageCount} bed images.`);
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Saved ${Object.keys(manifest).length} verified image URLs to the frontend manifest.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
