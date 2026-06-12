import { Request } from 'express';
import { prisma } from "../../shared/prisma";
import ApiError from '../../errors/ApiError';

const createEvent = async (req: Request) => {
  const payload = req.body;
  const file = req.file;

  const { title, description, dateTime, venue, price, totalRows, seatsPerRow } = payload;
  const eventImage = file?.path;

  // 🎯 ১. ইউনিক টাইটেল চেক (একই নামের ইভেন্ট আছে কি না)
  const existingEvent = await prisma.event.findFirst({
    where: {
      title: {
        equals: title.trim(),
        mode: 'insensitive', // এর ফলে ছোট হাতের বা বড় হাতের অক্ষর (Case Insensitive) হলেও ম্যাচ ধরবে
      },
    },
  });

  if (existingEvent) {
    throw new ApiError(400, 'An event with this title already exists! Please choose a different title.');
  }

  // ২. সরাসরি ইভেন্ট তৈরি করুন (যদি টাইটেল ইউনিক হয়)
  const newEvent = await prisma.event.create({
    data: {
      title: title.trim(),
      description,
      dateTime: new Date(dateTime),
      venue,
      price: Number(price),
      imageUrl: eventImage,
    },
  });

  // ৩. অটোমেটিক সিটের ডাটা অ্যারে তৈরি
  const seatsData = [];
  const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  for (let i = 0; i < Number(totalRows); i++) {
    for (let j = 1; j <= Number(seatsPerRow); j++) {
      seatsData.push({
        eventId: newEvent.id,
        row: rowLetters[i],
        number: j,
        status: 'AVAILABLE',
      });
    }
  }

  // ৪. সরাসরি Bulk Insert (ডাটাবেজে সিট তৈরি হয়ে গেল)
  await prisma.seat.createMany({
    data: seatsData,
  });

  // ৫. ডাটাবেজ থেকে সিটসহ পুরো ডাটা তুলে এনে রিটার্ন করা
  const fullEventDetails = await prisma.event.findUnique({
    where: { id: newEvent.id },
    include: {
      seats: true, 
    },
  });

  return fullEventDetails;
};

const getSingleEvent = async (id: string) => {
  return await prisma.event.findUnique({
    where: { id },
    include: {
      seats: true,
    },
  });
};

export const eventServices = {
  createEvent,
  getSingleEvent,
};