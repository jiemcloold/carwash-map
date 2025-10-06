#!/usr/bin/env node

/**
 * 洗车商家数据抓取程序
 * 运行方式：node fetch-shops.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// API 配置
const API_URL = 'https://chfwb.meiqitc.com/mqh5svr/serviceStore/byAddressDis';
const LIMIT_PER_PAGE = 10;

// 北京市中心坐标
const DEFAULT_PARAMS = {
    storeName: "",
    lng: 116.407526,
    lat: 39.904030,
    searchUp: 1,
    saleChannelNo: "ECPIC",
    branchCode: "1010100",
    provinceName: "北京市",
    cityName: "北京市",
    countyName: "",
    serviceType: "01",
    subServiceType: "0104",
    orderFlag: 1
};

/**
 * 延迟函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取单页数据
 */
async function fetchPage(page) {
    const params = {
        ...DEFAULT_PARAMS,
        page,
        limit: LIMIT_PER_PAGE
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Content-Type': 'application/json;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                'Origin': 'https://chfwb.meiqitc.com',
                'Referer': 'https://chfwb.meiqitc.com/mqstatic/1010100/',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== '0') {
            throw new Error(`API error! code: ${data.code}, message: ${data.msg}`);
        }

        // data.data 是一个对象，真实数据在 data.data.data 里
        return data.data?.data || [];
    } catch (error) {
        console.error(`❌ 第 ${page} 页获取失败:`, error.message);
        return null;
    }
}

/**
 * 获取所有商家数据
 */
async function fetchAllShops() {
    console.log('🚀 开始获取商家数据...\n');

    const allShops = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        console.log(`📄 正在获取第 ${page} 页...`);

        const shops = await fetchPage(page);

        if (shops === null) {
            // 请求失败，停止
            break;
        }

        if (shops.length === 0) {
            // 没有更多数据
            console.log('✅ 没有更多数据\n');
            hasMore = false;
            break;
        }

        // 处理商家数据
        shops.forEach(shop => {
            // lonLat 格式: "116.274754,40.200921"
            const [lng, lat] = (shop.lonLat || ',').split(',').map(Number);

            allShops.push({
                name: shop.storeName || '',
                address: shop.address || '',
                phone: shop.phone || '',
                workTime: shop.storeBusinessTime || shop.businessTime || '',
                lat: lat || 0,
                lng: lng || 0
            });
        });

        console.log(`✓ 第 ${page} 页完成，获取 ${shops.length} 条数据\n`);

        // 如果返回数据少于 limit，说明是最后一页
        if (shops.length < LIMIT_PER_PAGE) {
            hasMore = false;
        } else {
            page++;
            // 延迟避免请求过快
            await sleep(300);
        }
    }

    return allShops;
}

/**
 * 保存数据到文件
 */
function saveData(shops) {
    const dataDir = path.join(__dirname, 'data');

    // 确保 data 目录存在
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // 保存 JSON 文件
    const jsonPath = path.join(dataDir, 'shops.json');
    fs.writeFileSync(jsonPath, JSON.stringify(shops, null, 2), 'utf-8');
    console.log(`💾 数据已保存到: ${jsonPath}`);

    // 保存带时间戳的备份
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(dataDir, `shops_${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(shops, null, 2), 'utf-8');
    console.log(`💾 备份已保存到: ${backupPath}`);

    // 保存简单的文本列表
    const txtPath = path.join(dataDir, 'shops.txt');
    const txtContent = shops.map((shop, index) =>
        `${index + 1}. ${shop.name}\n   地址: ${shop.address}\n   电话: ${shop.phone}\n   营业时间: ${shop.workTime}\n`
    ).join('\n');
    fs.writeFileSync(txtPath, txtContent, 'utf-8');
    console.log(`💾 文本列表已保存到: ${txtPath}`);
}

/**
 * 主函数
 */
async function main() {
    try {
        const shops = await fetchAllShops();

        if (shops.length === 0) {
            console.log('⚠️  未获取到任何数据');
            process.exit(1);
        }

        console.log(`\n📊 总计获取 ${shops.length} 家商家`);
        console.log('\n前 5 家商家预览:');
        shops.slice(0, 5).forEach((shop, index) => {
            console.log(`${index + 1}. ${shop.name} - ${shop.address}`);
        });

        saveData(shops);

        console.log('\n✅ 数据获取完成！');
        console.log('\n下一步运行: npm run generate 生成地图文件');

    } catch (error) {
        console.error('\n❌ 程序执行出错:', error);
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = { fetchAllShops };
