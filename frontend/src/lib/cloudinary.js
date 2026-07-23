import { cloudinaryConfig } from "./cloudinaryConfig";

// Uploads directly from the browser to Cloudinary using an unsigned upload
// preset — no backend needed, no API secret exposed. Free tier is generous
// for profile pictures.
export async function uploadProfilePicture(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  const json = await res.json();
  if (!json.secure_url) {
    throw new Error(json.error?.message || "Image upload failed");
  }
  return json.secure_url;
}
