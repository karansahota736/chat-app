// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Chat from './pages/Chat';
import TestMedia from './components/TestMedia';
import Register from './pages/Register';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
                <Route path="/test" element={<TestMedia />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
