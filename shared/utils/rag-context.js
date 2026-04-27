function buildHotelsContext(hotels = []) {
  return hotels
    .map((hotel, idx) => {
      const parts = [
        `[${idx + 1}] ${hotel.name} (hotel)`,
        `Destination: ${hotel.destinationSlug || hotel.city || ''}`,
        `Region: ${hotel.region || ''}`,
        `Category: ${hotel.category || ''}`,
        `Rating: ${hotel.rating || ''}`,
        `PricePerNight: ${hotel.pricePerNight || ''}`,
        `Beachfront: ${hotel?.beach?.isBeachfront ? 'yes' : 'no'}`,
        `SeaDistanceMeters: ${hotel?.beach?.seaDistanceMeters ?? ''}`,
        `TravelStyles: ${(hotel.travelStyles || []).join(', ')}`,
        `Themes: ${(hotel.themes || []).join(', ')}`,
        `Highlights: ${(hotel.highlights || []).join(', ')}`,
        `Description: ${hotel.description || ''}`,
      ];
      return parts.join('\n');
    })
    .join('\n\n---\n\n');
}

module.exports = { buildHotelsContext };
