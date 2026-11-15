import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { calculateRequiredBeds, MAX_CHILDREN, MAX_GUESTS } from "./occupancyRules.js";
import { getNextDate, getValidDate } from "../utils/stayFormatting.js";

function parseChildAges(value) {
  if (!value) return [];
  return value.split(",")
    .slice(0, MAX_CHILDREN)
    .map(Number)
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
}

function getInitialBeds(value) {
  const beds = Number(value);
  return Number.isInteger(beds) && beds >= 1 && beds <= 4 ? beds : 2;
}

function getInitialAdultCount(guestCount, childCount) {
  if (Number.isInteger(guestCount) && guestCount > 0 && guestCount <= MAX_GUESTS) {
    return Math.max(1, guestCount - childCount);
  }
  return Math.max(1, 2 - childCount);
}

export default function useHotelReservation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBeds, setSelectedBeds] = useState(() => getInitialBeds(searchParams.get("beds")));
  const initialCheckIn = getValidDate(searchParams.get("checkIn"), 1);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(() => {
    const requestedCheckOut = getValidDate(searchParams.get("checkOut"), 2);
    return requestedCheckOut > initialCheckIn ? requestedCheckOut : getNextDate(initialCheckIn);
  });
  const [childAges, setChildAges] = useState(() => parseChildAges(searchParams.get("children")));
  const [adultCount, setAdultCount] = useState(() => {
    const requestedAdults = Number(searchParams.get("adults"));
    if (Number.isInteger(requestedAdults) && requestedAdults >= 1 && requestedAdults <= MAX_GUESTS) {
      return requestedAdults;
    }
    return getInitialAdultCount(Number(searchParams.get("guests")), childAges.length);
  });
  const [paymentType, setPaymentType] = useState(() => (
    searchParams.get("paymentType") === "Advance" ? "Advance" : "Full"
  ));
  const [bookingNotice, setBookingNotice] = useState("");

  const guestCount = adultCount + childAges.length;
  const requiredBeds = calculateRequiredBeds(adultCount, childAges);
  const roomFitsGuests = requiredBeds === selectedBeds;

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("checkIn", checkIn);
    nextParams.set("checkOut", checkOut);
    nextParams.set("guests", String(guestCount));
    nextParams.set("beds", String(selectedBeds));
    nextParams.set("adults", String(adultCount));
    nextParams.set("paymentType", paymentType);
    if (childAges.length) nextParams.set("children", childAges.join(","));
    else nextParams.delete("children");

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [adultCount, checkIn, checkOut, childAges, guestCount, paymentType, searchParams, selectedBeds, setSearchParams]);

  function updateCheckIn(value) {
    if (!value) return;
    setCheckIn(value);
    if (checkOut <= value) setCheckOut(getNextDate(value));
  }

  function updateCheckOut(value) {
    if (value && value > checkIn) setCheckOut(value);
  }

  function updateChildCount(nextCount) {
    if (nextCount > childAges.length && childAges.length < MAX_CHILDREN && guestCount < MAX_GUESTS) {
      setChildAges((ages) => [...ages, 5]);
    } else if (nextCount < childAges.length) {
      setChildAges((ages) => ages.slice(0, -1));
    }
  }

  function updateChildAge(index, age) {
    setChildAges((ages) => ages.map((currentAge, childIndex) => (
      childIndex === index ? Number(age) : currentAge
    )));
  }

  return {
    adultCount,
    bookingNotice,
    checkIn,
    checkOut,
    childAges,
    guestCount,
    paymentType,
    requiredBeds,
    roomFitsGuests,
    selectedBeds,
    setAdultCount,
    setBookingNotice,
    setPaymentType,
    setSelectedBeds,
    updateCheckIn,
    updateCheckOut,
    updateChildAge,
    updateChildCount,
  };
}
