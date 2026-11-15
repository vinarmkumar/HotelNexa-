import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./HomePage/HomePage.jsx";
import SignIn from "./SigninSignup/Components/SignIn.jsx";
import SignUp from "./SigninSignup/Components/SignUp.jsx";
import AdminDashboard from "./AdminDashboard/AdminDashboard.jsx";
import HotelDetailPage from "./HomePage/HotelDetailPage.jsx";
import MyBookings from "./HomePage/MyBookings.jsx";
import ScrollManager from "./ScrollManager.jsx";
import AIConciergeWidget from "./NEXAAI/AIConciergeWidget.jsx";
import HotelAdminDashboard from "./HotelAdmin/HotelAdminDashboard.jsx";

export default function App() {
  return (
    <>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/hotel-admin" element={<HotelAdminDashboard />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/hotel/*" element={<HotelDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AIConciergeWidget />
    </>
  );
}