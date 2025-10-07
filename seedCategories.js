// seedCategories.js
const mongoose = require("mongoose");
const Category = require("./src/models/Category"); // đường dẫn tới file Category.js

// 👉 thay chuỗi kết nối MongoDB của bạn
const MONGO_URI = "mongodb://localhost:27017/PIRA_System";

const categories = [
  {
    name: "Lều & Dụng cụ cắm trại",
    slug: "leu-dung-cu-cam-trai",
    description: "Các loại lều, bạt, túi ngủ, ghế xếp phục vụ cắm trại",
    children: [
      {
        name: "Lều cắm trại 2 người",
        slug: "leu-cam-trai-2-nguoi",
        description: "Lều gọn nhẹ cho 1-2 người đi trekking hoặc dã ngoại"
      },
      {
        name: "Lều gia đình",
        slug: "leu-gia-dinh",
        description: "Lều rộng cho 4-6 người, phù hợp đi nhóm hoặc gia đình"
      },
      {
        name: "Túi ngủ & Tấm trải",
        slug: "tui-ngu-tam-trai",
        description: "Túi ngủ, tấm trải cách nhiệt, đệm hơi"
      },
      {
        name: "Ghế & Bàn gấp",
        slug: "ghe-ban-gap",
        description: "Ghế gấp du lịch, bàn xếp gọn nhẹ"
      }
    ]
  },
  {
    name: "Ba lô & Túi du lịch",
    slug: "ba-lo-tui-du-lich",
    description: "Các loại ba lô phượt, túi chống nước, túi đeo tiện ích",
    children: [
      {
        name: "Ba lô leo núi",
        slug: "ba-lo-leo-nui",
        description: "Ba lô dung tích lớn 40L-70L cho trekking và leo núi"
      },
      {
        name: "Túi chống nước",
        slug: "tui-chong-nuoc",
        description: "Túi khô, túi chống nước dùng cho đi biển, chèo thuyền"
      }
    ]
  },
  {
    name: "Thiết bị nấu ăn ngoài trời",
    slug: "thiet-bi-nau-an-ngoai-troi",
    description: "Bếp ga mini, bếp cồn, bộ nồi xoong chảo, bình nước du lịch",
    children: [
      {
        name: "Bếp & Nhiên liệu",
        slug: "bep-nhien-lieu",
        description: "Bếp ga mini, bếp cồn, viên nén cồn khô"
      },
      {
        name: "Bộ nồi & Dụng cụ ăn uống",
        slug: "bo-noi-dung-cu-an-uong",
        description: "Nồi du lịch, cốc inox, dao nĩa gấp gọn"
      },
      {
        name: "Bình nước & Bình giữ nhiệt",
        slug: "binh-nuoc-giu-nhiet",
        description: "Bình lọc nước, bình giữ nhiệt cho dã ngoại"
      }
    ]
  },
  {
    name: "Đèn pin & Thiết bị chiếu sáng",
    slug: "den-pin-thiet-bi-chieu-sang",
    description: "Đèn pin siêu sáng, đèn đội đầu, đèn lều, đèn năng lượng mặt trời",
    children: [
      {
        name: "Đèn pin cầm tay",
        slug: "den-pin-cam-tay",
        description: "Đèn pin LED siêu sáng, chống nước"
      },
      {
        name: "Đèn đội đầu",
        slug: "den-doi-dau",
        description: "Đèn đội đầu dùng khi trekking ban đêm"
      },
      {
        name: "Đèn lều",
        slug: "den-leu",
        description: "Đèn treo trong lều hoặc đèn năng lượng mặt trời"
      }
    ]
  },
  {
    name: "Dụng cụ an toàn & Cứu hộ",
    slug: "dung-cu-an-toan-cuu-ho",
    description: "Bộ sơ cứu, dao đa năng, gậy leo núi, áo phao",
    children: [
      {
        name: "Bộ sơ cứu",
        slug: "bo-so-cuu",
        description: "Túi y tế, bông băng, thuốc cơ bản"
      },
      {
        name: "Dao đa năng & Dụng cụ sinh tồn",
        slug: "dao-da-nang-sinh-ton",
        description: "Dao đa năng, bật lửa sinh tồn, còi cứu hộ"
      },
      {
        name: "Trang bị leo núi",
        slug: "trang-bi-leo-nui",
        description: "Dây leo núi, móc carabiner, gậy trekking"
      }
    ]
  },
  {
    name: "Thiết bị công nghệ du lịch",
    slug: "thiet-bi-cong-nghe-du-lich",
    description: "Máy ảnh, GoPro, flycam, pin dự phòng, bộ phát wifi",
    children: [
      {
        name: "Máy ảnh & GoPro",
        slug: "may-anh-gopro",
        description: "Máy ảnh du lịch, GoPro chống nước"
      },
      {
        name: "Flycam & Drone",
        slug: "flycam-drone",
        description: "Drone quay phim chụp ảnh"
      },
      {
        name: "Thiết bị điện tử khác",
        slug: "thiet-bi-dien-tu-khac",
        description: "Pin dự phòng, bộ phát wifi, sạc năng lượng mặt trời"
      }
    ]
  },
  {
    name: "Phương tiện di chuyển",
    slug: "phuong-tien-di-chuyen",
    description: "Xe máy, xe đạp địa hình, ván trượt, kayak",
    children: [
      {
        name: "Xe máy du lịch",
        slug: "xe-may-du-lich",
        description: "Xe số, xe tay ga cho thuê theo ngày"
      },
      {
        name: "Xe đạp địa hình",
        slug: "xe-dap-dia-hinh",
        description: "Xe đạp MTB, xe đạp đường dài"
      },
      {
        name: "Kayak & SUP",
        slug: "kayak-sup",
        description: "Thuyền kayak, ván chèo đứng SUP"
      },
      {
        name: "Ván trượt & Patin",
        slug: "van-truot-patin",
        description: "Ván trượt địa hình, giày patin"
      }
    ]
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Xóa cũ để tránh trùng slug
    await Category.deleteMany({});
    console.log("🗑️ Cleared old categories");

    for (const cat of categories) {
      const parent = await Category.create({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        level: 0,
        path: cat.slug
      });

      if (cat.children && cat.children.length > 0) {
        for (const child of cat.children) {
          await Category.create({
            name: child.name,
            slug: child.slug,
            description: child.description,
            parentCategory: parent._id,
            level: 1,
            path: `${cat.slug}/${child.slug}`
          });
        }
      }
    }

    console.log("🌱 Seed categories successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding categories:", err);
    process.exit(1);
  }
}

seed();
