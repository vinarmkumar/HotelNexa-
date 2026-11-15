import { useEffect } from "react";
import { X } from "lucide-react";

export default function PropertyPhotoLightbox({ photo, propertyName, onClose }) {
  useEffect(() => {
    if (!photo) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, photo]);

  if (!photo) return null;

  return (
    <div className="property-photo-lightbox" role="presentation" onClick={onClose}>
      <section
        className="property-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${photo.label} enlarged photo`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="property-photo-close" aria-label="Close enlarged photo" onClick={onClose}>
          <X size={20} />
        </button>
        <img src={photo.image} alt={photo.label} />
        <p>{photo.label} <span>{propertyName}</span></p>
      </section>
    </div>
  );
}
