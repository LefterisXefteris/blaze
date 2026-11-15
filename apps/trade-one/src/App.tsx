import { Hero } from "./components/Hero";
import { Feed } from "./components/Feed";
import { Calendar } from "./components/Calendar";
import { Glossary } from "./components/Glossary";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <Hero />
      <div className="divider" />
      <Feed />
      <div className="divider" />
      <Calendar />
      <div className="divider" />
      <Glossary />
      <Footer />
    </>
  );
}
