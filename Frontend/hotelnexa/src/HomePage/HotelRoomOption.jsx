export default function HotelRoomOption({ bedType, image }) {
  return (
    <article className="hotel-room-option">
      <img src={image} alt={`${bedType} room`} loading="lazy" />
      <span>{bedType}</span>
    </article>
  );
}
