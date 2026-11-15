import {
  Baby,
  Bath,
  BedDouble,
  BriefcaseBusiness,
  Coffee,
  Map,
  ParkingCircle,
  Refrigerator,
  Snowflake,
  Sparkles,
  Tv,
  UsersRound,
  Waves,
  Wifi,
} from "lucide-react";

export const bedTypes = [
  { count: 1, title: "Single bed", caption: "A one-bed room profile", icon: BedDouble },
  { count: 2, title: "Double bed", caption: "A two-bed room profile", icon: BedDouble },
  { count: 3, title: "Triple bed", caption: "A three-bed room profile", icon: BedDouble },
  { count: 4, title: "Four bed", caption: "A four-bed room profile", icon: BedDouble },
];

export const amenityGroups = [
  {
    title: "Comfort & essentials",
    items: [
      ["wifi", "Complimentary Wi-Fi", Wifi],
      ["airConditioning", "Air conditioning", Snowflake],
      ["heating", "Heating", Sparkles],
      ["television", "Television", Tv],
      ["refrigerator", "Refrigerator", Refrigerator],
      ["privateBathroom", "Private bathroom", Bath],
      ["workspace", "Workspace", BriefcaseBusiness],
      ["balcony", "Balcony", Map],
    ],
  },
  {
    title: "Property & dining",
    items: [
      ["breakfast", "Breakfast included", Coffee],
      ["pool", "Swimming pool", Waves],
      ["carPark", "Car parking", ParkingCircle],
      ["restaurant", "Restaurant", Coffee],
      ["familyFriendly", "Family friendly", Baby],
      ["coupleFriendly", "Couples welcome", UsersRound],
    ],
  },
];

export const propertySectionLinks = [
  ["overview", "Overview"],
  ["rooms", "Rooms"],
  ["facilities", "Facilities"],
  ["reviews", "Reviews"],
  ["location", "Location"],
  ["policies", "Policies"],
];
