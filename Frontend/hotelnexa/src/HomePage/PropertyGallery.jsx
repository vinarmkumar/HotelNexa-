import { ArrowRight, ZoomIn } from "lucide-react";

export default function PropertyGallery({ hotel, photos, onPreviewPhoto }) {
  return (
    <section className="property-gallery" aria-label={`${hotel.hotelName} photo gallery`}>
      {photos.map((photo, index) => (
        <figure className={`property-gallery-photo property-gallery-photo-${index + 1}`} key={`${photo.label}-${index}`}>
          <button
            type="button"
            className="property-image-preview-trigger"
            aria-label={`Enlarge ${photo.label}`}
            onClick={() => onPreviewPhoto(photo)}
          >
            <img src={photo.image} alt={`${hotel.hotelName} — ${photo.label}`} loading={index > 1 ? "lazy" : "eager"} />
            <span className="property-image-zoom-hint"><ZoomIn size={15} /> Enlarge</span>
          </button>
          <figcaption>{photo.label}</figcaption>
        </figure>
      ))}
      <a className="property-gallery-count" href="#rooms">{photos.length} photo views <ArrowRight size={13} /></a>
    </section>
  );
}
