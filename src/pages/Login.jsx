import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState(""); // 👈 for error display
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrorMsg(""); // clear any previous error

    try {
    const res = await fetch(
  `${process.env.REACT_APP_API_URL}/api/login`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }
);

      if (!res.ok) {
        const text = await res.text(); // read error message
        setErrorMsg(text);
        return;
      }

      const data = await res.json();

      // Store user info in localStorage (or use a global state/store)
      localStorage.setItem("user", JSON.stringify(data.user));

      // ✅ Navigate to chat page
      navigate("/chat");
    } catch (err) {
      console.error("Login Error:", err);
      setErrorMsg("Server error. Please try again later.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Welcome Back
        </h2>

        {errorMsg && (
          <div className="mb-4 text-red-600 text-sm text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block mb-1 text-sm text-gray-600">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"/>
          </div>

          <div>
            <label htmlFor="password" className="block mb-1 text-sm text-gray-600">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don’t have an account?{" "}
          <a href="/register" className="text-indigo-600 font-semibold hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}
