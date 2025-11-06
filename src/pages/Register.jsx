import React, { useState } from "react";
import axios from "axios";

export default function Register() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
const res = await axios.post(
  `${process.env.REACT_APP_API_URL}/api/register`,
  formData
);
      setMessage(res.data);
      setFormData({ name: "", email: "", password: "" });
    } catch (err) {
      setMessage(err.response?.data || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center  bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500">
      <div className="bg-white shadow-2xl rounded-2xl p-8 w-full max-w-md border border-gray-200">
        <h2 className="text-3xl font-bold text-center text-blue-700 mb-6">Create an Account</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Full Name"
            className="w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email Address"
            className="w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Password"
            className="w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Register
          </button>
        </form>
        {message && (
          <p className="mt-4 text-center text-sm text-gray-600">{message}</p>
        )}
        <div className="text-center mt-6 text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/" className="text-blue-600 hover:underline">
            Login here
          </a>
        </div>
      </div>
    </div>
  );
}
