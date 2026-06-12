export type TEventCreatePayload = {
  title: string;
  description?: string;
  dateTime: string; // ফ্রন্টএন্ড থেকে ISO স্ট্রিং বা ডেট ফরম্যাটে আসবে
  venue: string;
  price: number;
  totalRows: number;   // যেমন: ৫টি রো (A, B, C, D, E)
  seatsPerRow: number; // যেমন: প্রতি রো-তে ১০টি করে সিট
};