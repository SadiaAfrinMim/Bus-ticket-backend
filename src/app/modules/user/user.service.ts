import { Request } from "express";
import { prisma } from "../../shared/prisma";
import bcrypt from "bcryptjs";



import { IJWTPayload } from "../../types/common";
import { fileUploader } from "../../helpers/fileUploader";
import { userSearchAbleFields } from "./user.constant";
import { IOptions, paginationHelper } from "../../helpers/paginationHelper";
import { Role, User, UserStatus } from "@prisma/client";




const createAdmin = async (req: Request) => {
    // ১. রিকোয়েস্ট থেকে ফাইল/ছবি নেওয়া
    const file = req.file;
    let profilePhotoUrl = null;

    if (file) {
        // ক্লাউডিনারিতে আপলোড (আপনার আগের লজিক অনুযায়ী)
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        profilePhotoUrl = uploadToCloudinary?.secure_url;
    }

    // ২. পাসওয়ার্ড হ্যাশ (Hash) করা
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // ৩. metaData তৈরি করা (যদি ফ্রন্টএন্ড থেকে designation বা companyName পাঠায়)
    // form-data ব্যবহার করলে JSON.parse করা লাগতে পারে, তাই এভাবে হ্যান্ডেল করা নিরাপদ:
    let metaDataJson = null;
    if (req.body.metaData) {
        metaDataJson = typeof req.body.metaData === 'string' 
            ? JSON.parse(req.body.metaData) 
            : req.body.metaData;
    }

    // ৪. ডেটাবেজে অ্যাডমিন ইউজার তৈরি করা (এখানে কোনো transaction লাগবে না, কারণ টেবিল একটিই)
    const result = await prisma.user.create({
        data: {
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword,
            role: Role.ADMIN, // 👈 এখানে রোল হিসেবে ADMIN সেট করে দেওয়া হচ্ছে
            profilePic: profilePhotoUrl,
            metaData: metaDataJson // 👈 ম্যাজিক ফিল্ডে এক্সট্রা তথ্য সেভ হচ্ছে
        }
    });

    // সিকিউরিটির জন্য রিটার্ন করার আগে পাসওয়ার্ডটি অবজেক্ট থেকে বাদ দিয়ে দেওয়া ভালো
    const { password, ...adminWithoutPassword } = result;
    return adminWithoutPassword;
};


const createUser = async (req: Request) => {
    // ১. প্রোফাইল ছবি আপলোড হ্যান্ডেল করা
    const file = req.file;
    let profilePhotoUrl = null;

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        profilePhotoUrl = uploadToCloudinary?.secure_url;
    }
       // form-data ব্যবহার করলে JSON.parse করা লাগতে পারে, তাই এভাবে হ্যান্ডেল করা নিরাপদ:
    let metaDataJson = null;
    if (req.body.metaData) {
        metaDataJson = typeof req.body.metaData === 'string' 
            ? JSON.parse(req.body.metaData) 
            : req.body.metaData;
    }

    // ২. পাসওয়ার্ড হ্যাশ করা
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // ৩. ডাটাবেজে ইউজার তৈরি করা
    const result = await prisma.user.create({
        data: {
            name: req.body.name,
            email: req.body.email.toLowerCase(), // ইমেইলকে ছোট হাতের করে সেভ করা নিরাপদ
            password: hashedPassword,
            role: Role.USER, // 👈 এটি নিশ্চিত করবে যে ডাটাবেজে 'USER' বড় হাতের অক্ষরেই সেভ হচ্ছে
            profilePic: profilePhotoUrl,
              metaData: metaDataJson 
        }
    });

    // ৪. সিকিউরিটির জন্য পাসওয়ার্ড বাদ দিয়ে ডাটা রিটার্ন করা
    const { password, ...userWithoutPassword } = result;
    return userWithoutPassword;
};
// const createUser = async (req: Request): Promise<User> => {

//     const file = req.file;

//     if (file) {
//         const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
//         req.body.doctor.profilePhoto = uploadToCloudinary?.secure_url
//     }
//     const hashedPassword: string = await bcrypt.hash(req.body.password, 10)

//     const userData = {
//         email: req.body.doctor.email,
//         password: hashedPassword,
//         role: Role.USER
//     }

//     const result = await prisma.$transaction(async (transactionClient) => {
//         await transactionClient.user.create({
//             data: userData
//         });

//         const createdDoctorData = await transactionClient.doctor.create({
//             data: req.body.doctor
//         });

//         return createdDoctorData;
//     });

//     return result;
// };


const getAllFromDB = async (params: any, options: IOptions) => {
    const { page, limit, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options)
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.UserWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: userSearchAbleFields.map(field => ({
                [field]: {
                    contains: searchTerm,
                    mode: "insensitive"
                }
            }))
        })
    }

    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        })
    }

    const whereConditions: Prisma.UserWhereInput = andConditions.length > 0 ? {
        AND: andConditions
    } : {}

    const result = await prisma.user.findMany({
        skip,
        take: limit,

        where: whereConditions,
        orderBy: {
            [sortBy]: sortOrder
        }
    });

    const total = await prisma.user.count({
        where: whereConditions
    });
    return {
        meta: {
            page,
            limit,
            total
        },
        data: result
    };
}

const getMyProfile = async (user: IJWTPayload) => {
    const userInfo = await prisma.user.findUniqueOrThrow({
        where: {
            email: user.email,
            status: UserStatus.ACTIVE
        },
        select: {
            id: true,
            email: true,
            needPasswordChange: true,
            role: true,
            status: true
        }
    })

    let profileData;

    if (userInfo.role === UserRole.PATIENT) {
        profileData = await prisma.patient.findUnique({
            where: {
                email: userInfo.email
            }
        })
    }
    else if (userInfo.role === UserRole.DOCTOR) {
        profileData = await prisma.doctor.findUnique({
            where: {
                email: userInfo.email
            }
        })
    }
    else if (userInfo.role === UserRole.ADMIN) {
        profileData = await prisma.admin.findUnique({
            where: {
                email: userInfo.email
            }
        })
    }

    return {
        ...userInfo,
        ...profileData
    };

};

const changeProfileStatus = async (id: string, payload: { status: UserStatus }) => {
    const userData = await prisma.user.findUniqueOrThrow({
        where: {
            id
        }
    })

    const updateUserStatus = await prisma.user.update({
        where: {
            id
        },
        data: payload
    })

    return updateUserStatus;
};

const updateMyProfie = async (user: IJWTPayload, req: Request) => {
    const userInfo = await prisma.user.findUniqueOrThrow({
        where: {
            email: user?.email,
            status: UserStatus.ACTIVE
        }
    });

    const file = req.file;
    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.profilePhoto = uploadToCloudinary?.secure_url;
    }

    let profileInfo;

    if (userInfo.role === Role.ADMIN) {
        profileInfo = await prisma.admin.update({
            where: {
                email: userInfo.email
            },
            data: req.body
        })
    }
    else if (userInfo.role === Role.USER) {
        profileInfo = await prisma.user.update({
            where: {
                email: userInfo.email
            },
            data: req.body
        })
    }
  

    return { ...profileInfo };
}

export const UserService = {
   
    createAdmin,
    createUser,
    getAllFromDB,
    getMyProfile,
    changeProfileStatus,
    updateMyProfie
}