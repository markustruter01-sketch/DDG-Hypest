/**
 * Daily motivation on Home. Every line is checked against a published source (17 Oct 2026);
 * add new ones only with a source. Popular quotes are often misattributed online.
 */
export type Quote = { text: string; by: string; source: string };

export const QUOTES: Quote[] = [
  { text: "I want to open minds to think that no human is limited.", by: "Eliud Kipchoge", source: "Wikiquote: remarks on breaking the two-hour marathon barrier" },
  { text: "I can accept failure. Everyone fails at something. But I can't accept not trying.", by: "Michael Jordan", source: "I Can't Accept Not Trying (1994), p. 129" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", by: "Michael Jordan", source: "Nike 'Failure' ad (1997), quoted in Nike Culture (1998), p. 49" },
  { text: "I approached everything step by step.", by: "Michael Jordan", source: "How to Be Like Mike (2005), via Wikiquote" },
  { text: "I really think a champion is defined not by their wins but by how they can recover when they fall.", by: "Serena Williams", source: "The National, via TIME" },
  { text: "I am a full woman and I'm strong, and I'm powerful, and I'm beautiful at the same time.", by: "Serena Williams", source: "ESPN, via TIME" },
  { text: "If you smile things will work out.", by: "Serena Williams", source: "The Champion's Comeback (Jim Afremow), via TIME" },
  { text: "A man who is not courageous enough to take risks will never accomplish anything in life.", by: "Muhammad Ali", source: "News conference, Houston, 28 Oct 1984, via The Globe and Mail" },
  { text: "What I suffered physically was worth what I've accomplished in life.", by: "Muhammad Ali", source: "News conference, Houston, 28 Oct 1984, via The Globe and Mail" },
  { text: "Float like a butterfly, sting like a bee.", by: "Muhammad Ali", source: "Sports Illustrated" },
  { text: "Pressure is a privilege.", by: "Billie Jean King", source: "Title of her book, Pressure Is a Privilege" },
];

/** Same quote all day for everyone, changing at midnight Brisbane time. */
export function quoteOfTheDay(now = new Date()): Quote {
  const brisbaneDay = Math.floor((now.getTime() + 10 * 3600 * 1000) / 86_400_000);
  return QUOTES.at(brisbaneDay % QUOTES.length) ?? QUOTES[0]!;
}
