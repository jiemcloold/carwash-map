#!/usr/bin/env node

/**
 * 生成手机地图 HTML 文件
 * 运行方式：node generate-map.js
 */

const fs = require('fs');
const path = require('path');

/**
 * 读取商家数据
 */
function loadShops() {
    const dataPath = path.join(__dirname, 'data', 'shops.json');

    if (!fs.existsSync(dataPath)) {
        console.error('❌ 数据文件不存在，请先运行: npm run fetch');
        process.exit(1);
    }

    const data = fs.readFileSync(dataPath, 'utf-8');
    return JSON.parse(data);
}

/**
 * GCJ-02 转 BD-09 坐标（火星坐标转百度坐标）
 */
function gcj02ToBd09(lng, lat) {
    const pi = 3.14159265358979324;
    const x_pi = (pi * 3000.0) / 180.0;

    const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_pi);
    const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_pi);
    const bdLng = z * Math.cos(theta) + 0.0065;
    const bdLat = z * Math.sin(theta) + 0.006;

    return { lng: bdLng, lat: bdLat };
}

/**
 * 生成 HTML 地图文件
 */
function generateMap(shops) {
    // 将商家坐标从 GCJ-02 转换为 BD-09
    const convertedShops = shops.map(shop => {
        const bdCoords = gcj02ToBd09(shop.lng, shop.lat);
        return {
            ...shop,
            lng: bdCoords.lng,
            lat: bdCoords.lat,
            originalLng: shop.lng,  // 保留原始坐标用于调试
            originalLat: shop.lat
        };
    });

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>洗车店地图 - 北京</title>
    <script src="https://api.map.baidu.com/api?v=3.0&ak=ZXzuJARUtenyDLmvx4Ixl5MD4nES4U2I"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body, html {
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            overflow: hidden;
        }

        #map {
            width: 100%;
            height: 100%;
        }

        #info {
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            padding: 12px;
            z-index: 1000;
            font-size: 14px;
            color: #333;
            min-height: 60px;
        }

        #infoText {
            line-height: 1.5;
        }

        #updateTime {
            font-size: 12px;
            color: #999;
            margin-top: 4px;
        }

        #loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px 40px;
            background: rgba(0,0,0,0.7);
            color: white;
            border-radius: 8px;
            font-size: 16px;
            z-index: 2000;
        }

        .hidden {
            display: none !important;
        }

        .refresh-btn {
            position: fixed;
            top: 80px;
            right: 10px;
            padding: 10px 18px;
            background: #FF6B6B;
            color: white;
            border: none;
            border-radius: 25px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(255,107,107,0.4);
            cursor: pointer;
            transition: all 0.3s;
            z-index: 1000;
        }

        .refresh-btn:active {
            transform: scale(0.95);
        }

        .refresh-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .cancel-route-btn {
            position: fixed;
            top: 80px;
            left: 10px;
            padding: 10px 18px;
            background: #666;
            color: white;
            border: none;
            border-radius: 25px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: all 0.3s;
            z-index: 1000;
        }

        .cancel-route-btn:active {
            transform: scale(0.95);
        }
    </style>
</head>
<body>
    <div id="loading">正在加载地图...</div>

    <div id="info">
        <div id="infoText">正在定位...</div>
        <div id="updateTime">数据更新: ${new Date().toLocaleString('zh-CN')}</div>
    </div>

    <button id="cancelRouteBtn" class="cancel-route-btn hidden" onclick="cancelRoute()">✕ 取消路线</button>
    <button id="refreshBtn" class="refresh-btn" onclick="refreshShops()">🔄 更新商家</button>

    <div id="map"></div>

    <script>
        let shops = ${JSON.stringify(convertedShops)};

        let map = null;
        let myLocation = null;
        let nearestShop = null;
        let markers = [];
        let currentDriving = null; // 保存当前路线规划实例

        // API 配置
        const API_URL = 'https://chfwb.meiqitc.com/mqh5svr/serviceStore/byAddressDis';
        const API_PARAMS = {
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

        // 初始化地图
        function initMap() {
            // 创建地图实例（默认北京市中心）
            map = new BMap.Map("map");
            const point = new BMap.Point(116.407526, 39.904030);
            map.centerAndZoom(point, 12);
            map.enableScrollWheelZoom(true);

            // 获取当前位置
            getCurrentLocation();
        }

        // GCJ-02 转 BD-09 坐标（火星坐标转百度坐标）
        function gcj02ToBd09(lng, lat) {
            const pi = 3.14159265358979324;
            const x_pi = (pi * 3000.0) / 180.0;

            const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_pi);
            const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_pi);
            const bdLng = z * Math.cos(theta) + 0.0065;
            const bdLat = z * Math.sin(theta) + 0.006;

            return {lng: bdLng, lat: bdLat};
        }

        // WGS-84 转 BD-09 坐标（GPS坐标转百度坐标）
        function wgs84ToBd09(lng, lat) {
            const pi = 3.14159265358979324;
            const x_pi = (pi * 3000.0) / 180.0;

            // WGS-84 转 GCJ-02
            let dlat = transformLat(lng - 105.0, lat - 35.0);
            let dlng = transformLng(lng - 105.0, lat - 35.0);
            const radlat = lat / 180.0 * pi;
            let magic = Math.sin(radlat);
            magic = 1 - 0.00669342162296594323 * magic * magic;
            const sqrtmagic = Math.sqrt(magic);
            dlat = (dlat * 180.0) / ((6335552.717000426 / magic / sqrtmagic) * pi);
            dlng = (dlng * 180.0) / (6378245.0 / sqrtmagic * Math.cos(radlat) * pi);
            const gcjLat = lat + dlat;
            const gcjLng = lng + dlng;

            // GCJ-02 转 BD-09
            const z = Math.sqrt(gcjLng * gcjLng + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * x_pi);
            const theta = Math.atan2(gcjLat, gcjLng) + 0.000003 * Math.cos(gcjLng * x_pi);
            const bdLng = z * Math.cos(theta) + 0.0065;
            const bdLat = z * Math.sin(theta) + 0.006;

            return {lng: bdLng, lat: bdLat};
        }

        function transformLat(lng, lat) {
            let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
            ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
            ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
            return ret;
        }

        function transformLng(lng, lat) {
            let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
            ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
            ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
            return ret;
        }

        // 获取当前位置
        function getCurrentLocation() {
            // 使用浏览器原生 Geolocation API（iOS Safari 更稳定）
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        // GPS坐标（WGS-84）转百度坐标（BD-09）
                        const bdCoords = wgs84ToBd09(position.coords.longitude, position.coords.latitude);

                        myLocation = {
                            lat: bdCoords.lat,
                            lng: bdCoords.lng
                        };

                        // 添加当前位置标记
                        const myMarker = new BMap.Marker(new BMap.Point(myLocation.lng, myLocation.lat), {
                            icon: new BMap.Icon(
                                'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMTAiIGZpbGw9IiMxOTg5ZmEiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIvPjwvc3ZnPg==',
                                new BMap.Size(30, 30)
                            )
                        });
                        map.addOverlay(myMarker);
                        map.centerAndZoom(new BMap.Point(myLocation.lng, myLocation.lat), 14);

                        // 显示商家标记
                        showShops();
                        document.getElementById('loading').classList.add('hidden');
                    },
                    function(error) {
                        console.error('定位失败:', error);
                        let errorMsg = '⚠️ 定位失败';

                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                errorMsg = '⚠️ 请允许位置权限';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                errorMsg = '⚠️ 位置信息不可用';
                                break;
                            case error.TIMEOUT:
                                errorMsg = '⚠️ 定位超时';
                                break;
                        }

                        document.getElementById('infoText').innerHTML = errorMsg + '，显示全部商家';
                        showShops();
                        document.getElementById('loading').classList.add('hidden');
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            } else {
                document.getElementById('infoText').innerHTML = '⚠️ 浏览器不支持定位';
                showShops();
                document.getElementById('loading').classList.add('hidden');
            }
        }

        // 显示商家标记
        function showShops() {
            // 清除旧标记
            markers.forEach(marker => map.removeOverlay(marker));
            markers = [];

            // 计算距离并排序
            let sortedShops = shops.map(shop => {
                if (myLocation) {
                    const distance = calculateDistance(
                        myLocation.lat,
                        myLocation.lng,
                        shop.lat,
                        shop.lng
                    );
                    return { ...shop, distance };
                }
                return { ...shop, distance: 0 };
            }).sort((a, b) => a.distance - b.distance);

            nearestShop = sortedShops[0];

            // 更新信息
            if (myLocation) {
                document.getElementById('infoText').innerHTML =
                    \`📍 最近: <strong>\${nearestShop.name}</strong> (\${formatDistance(nearestShop.distance)})\`;
            } else {
                document.getElementById('infoText').innerHTML = \`共 \${shops.length} 家洗车店\`;
            }

            // 添加商家标记
            sortedShops.forEach((shop, index) => {
                const point = new BMap.Point(shop.lng, shop.lat);

                // 最近的用红色标记，其他用蓝色
                const isNearest = index === 0 && myLocation;
                const marker = new BMap.Marker(point, {
                    icon: new BMap.Icon(
                        \`data:image/svg+xml;base64,\${isNearest ?
                            'PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTE1IDAgQzYuNyAwIDAgNi43IDAgMTUgQzAgMjMuMyAxNSA0MCAxNSA0MCBTMzAgMjMuMyAzMCAxNSBDMzAgNi43IDIzLjMgMCAxNSAwIFogTTE1IDIwIEMxMi4yIDIwIDEwIDE3LjggMTAgMTUgQzEwIDEyLjIgMTIuMiAxMCAxNSAxMCBDMTcuOCAxMCAyMCAxMi4yIDIwIDE1IEMyMCAxNy44IDE3LjggMjAgMTUgMjAgWiIgZmlsbD0iI2ZmNDQ0NCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+'
                            :
                            'PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTE1IDAgQzYuNyAwIDAgNi43IDAgMTUgQzAgMjMuMyAxNSA0MCAxNSA0MCBTMzAgMjMuMyAzMCAxNSBDMzAgNi43IDIzLjMgMCAxNSAwIFogTTE1IDIwIEMxMi4yIDIwIDEwIDE3LjggMTAgMTUgQzEwIDEyLjIgMTIuMiAxMCAxNSAxMCBDMTcuOCAxMCAyMCAxMi4yIDIwIDE1IEMyMCAxNy44IDE3LjggMjAgMTUgMjAgWiIgZmlsbD0iIzE5ODlmYSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+'
                        }\`,
                        new BMap.Size(30, 40),
                        { anchor: new BMap.Size(15, 40) }
                    )
                });

                // 添加信息窗口
                const infoWindow = new BMap.InfoWindow(
                    \`<div style="padding:10px;">
                        <h3 style="margin:0 0 8px 0;font-size:16px;">\${shop.name}</h3>
                        <p style="margin:4px 0;font-size:14px;color:#666;">📍 \${shop.address}</p>
                        \${shop.phone ? \`<p style="margin:4px 0;font-size:14px;"><a href="tel:\${shop.phone}" style="color:#00A870;text-decoration:none;font-weight:500;">📞 \${shop.phone}</a></p>\` : ''}
                        \${shop.workTime ? \`<p style="margin:4px 0;font-size:14px;color:#666;">⏰ \${shop.workTime}</p>\` : ''}
                        \${myLocation ? \`<p style="margin:4px 0;font-size:14px;color:#1989fa;font-weight:500;">📏 \${formatDistance(shop.distance)}</p>\` : ''}
                        <div style="margin-top:10px;display:flex;gap:8px;">
                            <button onclick="navigateTo(\${shop.lat}, \${shop.lng}, '\${shop.name.replace(/'/g, "\\\\'")}', '\${shop.address.replace(/'/g, "\\\\'")}', '\${shop.phone || ''}', 'amap')" style="flex:1;padding:8px;background:#00A870;color:white;border:none;border-radius:6px;font-size:13px;font-weight:500;">🧭 高德导航</button>
                            <button onclick="navigateTo(\${shop.lat}, \${shop.lng}, '\${shop.name.replace(/'/g, "\\\\'")}', '\${shop.address.replace(/'/g, "\\\\'")}', '\${shop.phone || ''}', 'baidu')" style="flex:1;padding:8px;background:#1989fa;color:white;border:none;border-radius:6px;font-size:13px;font-weight:500;">🧭 百度导航</button>
                        </div>
                        \${myLocation ? \`<button onclick="showRouteTo(\${shop.lat}, \${shop.lng}, '\${shop.name.replace(/'/g, "\\\\'")}\')" style="width:100%;margin-top:8px;padding:8px;background:#f5f5f5;color:#333;border:1px solid #ddd;border-radius:6px;font-size:13px;font-weight:500;">🗺️ 显示路线</button>\` : ''}
                    </div>\`,
                    { width: 280, height: 0 }
                );

                marker.addEventListener('click', function() {
                    map.openInfoWindow(infoWindow, point);
                });

                map.addOverlay(marker);
                markers.push(marker);
            });
        }

        // 导航到指定商家
        function navigateTo(lat, lng, name, address, phone, type) {
            // 构建搜索关键词（店名 + 地址）
            const keyword = name + ' ' + address;

            if (type === 'amap') {
                // 高德地图 - 直接搜索店名，让用户选择
                window.location.href = \`https://uri.amap.com/search?query=\${encodeURIComponent(keyword)}&city=北京&src=carwash\`;
            } else {
                // 百度地图 - 直接搜索店名，让用户选择
                window.location.href = \`baidumap://map/place/search?query=\${encodeURIComponent(keyword)}&region=北京&src=carwash\`;
            }
        }

        // 在地图上显示路线
        function showRouteTo(destLat, destLng, shopName) {
            if (!myLocation) {
                return;
            }

            // 清除之前的路线
            if (currentDriving) {
                currentDriving.clearResults();
            }

            // 显示加载状态
            document.getElementById('infoText').innerHTML = '🔍 正在规划路线...';

            // 创建驾车路线规划
            currentDriving = new BMap.DrivingRoute(map, {
                renderOptions: {
                    map: map,
                    autoViewport: true,
                    enableDragging: false
                },
                onSearchComplete: function(results) {
                    if (currentDriving.getStatus() === BMAP_STATUS_SUCCESS) {
                        const plan = results.getPlan(0);

                        // 获取路线信息
                        const distance = (plan.getDistance(false) / 1000).toFixed(1);
                        const duration = Math.ceil(plan.getDuration(false) / 60);

                        // 获取红绿灯数量（API直接返回）
                        const trafficLights = plan.getNumTrafficLights ? plan.getNumTrafficLights() : 0;

                        // 更新顶部信息栏
                        const infoHtml = \`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <span style="font-size:14px;font-weight:600;">🚗 前往: \${shopName || '目的地'}</span>
                            </div>
                            <div style="display:flex;gap:16px;margin-top:6px;font-size:13px;color:#666;">
                                <span>📏 <strong>\${distance}</strong> 公里</span>
                                <span>⏱️ 约 <strong>\${duration}</strong> 分钟</span>
                                \${trafficLights > 0 ? \`<span>🚦 <strong>\${trafficLights}</strong> 个红绿灯</span>\` : ''}
                            </div>
                        \`;
                        document.getElementById('infoText').innerHTML = infoHtml;

                        // 显示取消路线按钮
                        document.getElementById('cancelRouteBtn').classList.remove('hidden');
                    } else {
                        document.getElementById('infoText').innerHTML = '⚠️ 路线规划失败';
                    }
                },
                onMarkersSet: function(routes) {
                    // 路线标记设置完成
                }
            });

            // 规划路线
            const start = new BMap.Point(myLocation.lng, myLocation.lat);
            const end = new BMap.Point(destLng, destLat);
            currentDriving.search(start, end);
        }

        // 取消路线
        function cancelRoute() {
            if (currentDriving) {
                currentDriving.clearResults();
                currentDriving = null;
            }

            // 隐藏取消按钮
            document.getElementById('cancelRouteBtn').classList.add('hidden');

            // 恢复显示最近的商家信息
            if (nearestShop && myLocation) {
                document.getElementById('infoText').innerHTML =
                    \`📍 最近: <strong>\${nearestShop.name}</strong> (\${formatDistance(nearestShop.distance)})\`;
            } else {
                document.getElementById('infoText').innerHTML = \`共 \${shops.length} 家洗车店\`;
            }
        }

        // 计算距离
        function calculateDistance(lat1, lng1, lat2, lng2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        // 格式化距离
        function formatDistance(km) {
            if (km < 1) {
                return Math.round(km * 1000) + '米';
            }
            return km.toFixed(1) + '公里';
        }

        // 对比商家数据，检测变化
        function compareShops(oldShops, newShops) {
            const oldMap = new Map(oldShops.map(s => [s.name, s]));
            const newMap = new Map(newShops.map(s => [s.name, s]));

            const added = [];      // 新增的商家
            const removed = [];    // 移除的商家
            const updated = [];    // 信息更新的商家

            // 检查新增和更新
            newShops.forEach(newShop => {
                const oldShop = oldMap.get(newShop.name);
                if (!oldShop) {
                    added.push(newShop);
                } else {
                    // 检查是否有信息变化
                    if (oldShop.address !== newShop.address ||
                        oldShop.phone !== newShop.phone ||
                        oldShop.workTime !== newShop.workTime ||
                        oldShop.lat !== newShop.lat ||
                        oldShop.lng !== newShop.lng) {
                        updated.push({
                            name: newShop.name,
                            old: oldShop,
                            new: newShop
                        });
                    }
                }
            });

            // 检查移除
            oldShops.forEach(oldShop => {
                if (!newMap.has(oldShop.name)) {
                    removed.push(oldShop);
                }
            });

            return { added, removed, updated };
        }

        // 刷新商家数据
        async function refreshShops() {
            const btn = document.getElementById('refreshBtn');
            const loading = document.getElementById('loading');

            try {
                // 禁用按钮
                btn.disabled = true;
                btn.textContent = '🔄 检查更新...';
                loading.classList.remove('hidden');

                // 获取所有页面的数据
                const allShops = [];
                let page = 1;
                const limit = 10;

                while (true) {
                    const params = { ...API_PARAMS, page, limit };

                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'zh-CN,zh;q=0.9',
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Origin': 'https://chfwb.meiqitc.com',
                            'Referer': 'https://chfwb.meiqitc.com/mqstatic/1010100/',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: JSON.stringify(params)
                    });

                    const data = await response.json();

                    if (data.code !== '0' || !data.data?.data || data.data.data.length === 0) {
                        break;
                    }

                    // 处理商家数据
                    data.data.data.forEach(shop => {
                        const [lng, lat] = (shop.lonLat || ',').split(',').map(Number);
                        // 将 GCJ-02 坐标转换为 BD-09 坐标
                        const bdCoords = gcj02ToBd09(lng, lat);
                        allShops.push({
                            name: shop.storeName || '',
                            address: shop.address || '',
                            phone: shop.phone || '',
                            workTime: shop.storeBusinessTime || shop.businessTime || '',
                            lat: bdCoords.lat,
                            lng: bdCoords.lng
                        });
                    });

                    if (data.data.data.length < limit) {
                        break;
                    }

                    page++;
                }

                if (allShops.length > 0) {
                    // 对比数据
                    const changes = compareShops(shops, allShops);
                    const hasChanges = changes.added.length > 0 ||
                                      changes.removed.length > 0 ||
                                      changes.updated.length > 0;

                    // 显示对比结果
                    let message = \`📊 数据对比结果：\\n\\n\`;
                    message += \`当前数据：\${shops.length} 家\\n\`;
                    message += \`最新数据：\${allShops.length} 家\\n\\n\`;

                    if (hasChanges) {
                        if (changes.added.length > 0) {
                            message += \`🆕 新增：\${changes.added.length} 家\\n\`;
                            changes.added.forEach(s => {
                                message += \`  · \${s.name}\\n\`;
                            });
                        }
                        if (changes.removed.length > 0) {
                            message += \`\\n❌ 移除：\${changes.removed.length} 家\\n\`;
                            changes.removed.forEach(s => {
                                message += \`  · \${s.name}\\n\`;
                            });
                        }
                        if (changes.updated.length > 0) {
                            message += \`\\n📝 信息更新：\${changes.updated.length} 家\\n\`;
                            changes.updated.forEach(s => {
                                message += \`  · \${s.name}\\n\`;
                            });
                        }
                        message += \`\\n是否更新地图数据？\`;
                    } else {
                        message += \`✅ 数据已是最新，无需更新\`;
                    }

                    // 隐藏加载提示
                    loading.classList.add('hidden');
                    btn.disabled = false;
                    btn.textContent = '🔄 更新商家';

                    if (hasChanges) {
                        // 有变化，询问是否更新
                        if (confirm(message)) {
                            // 用户确认更新
                            shops = allShops;
                            showShops();
                            document.getElementById('updateTime').textContent =
                                \`数据更新: \${new Date().toLocaleString('zh-CN')} (共\${shops.length}家)\`;
                            alert(\`✅ 更新完成！\\n当前共 \${shops.length} 家商家\`);
                        }
                    } else {
                        // 无变化，仅提示
                        alert(message);
                    }
                } else {
                    loading.classList.add('hidden');
                    alert('⚠️ 未获取到数据，请稍后重试');
                }

            } catch (error) {
                console.error('更新失败:', error);
                alert('❌ 更新失败，请检查网络连接');
            } finally {
                // 恢复按钮
                btn.disabled = false;
                btn.textContent = '🔄 更新商家';
                loading.classList.add('hidden');
            }
        }

        // 页面加载完成后初始化地图
        window.onload = initMap;
    </script>
</body>
</html>`;

    return html;
}

/**
 * 保存 HTML 文件
 */
function saveMap(html) {
    const outputPath = path.join(__dirname, 'carwash-map.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`✅ 地图文件已生成: ${outputPath}`);
    console.log('\n使用方法:');
    console.log('1. 用隔空投送或 iCloud 把 carwash-map.html 传到 iPhone');
    console.log('2. 用 Safari 打开该文件');
    console.log('3. 点击分享按钮 → "添加到主屏幕"');
    console.log('4. 以后从主屏幕打开，自动定位并显示最近的商家\n');
}

/**
 * 主函数
 */
function main() {
    try {
        console.log('🗺️  开始生成地图文件...\n');

        const shops = loadShops();
        console.log(`📊 加载了 ${shops.length} 家商家数据`);

        const html = generateMap(shops);
        saveMap(html);

    } catch (error) {
        console.error('❌ 生成地图失败:', error);
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = { generateMap };
