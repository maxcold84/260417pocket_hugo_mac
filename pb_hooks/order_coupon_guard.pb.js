onRecordDeleteRequest((e) => {
    const couponUtil = require(`${__hooks}/utils/coupons.js`);
    const activeApp = e.app || $app;
    couponUtil.releaseCouponReservationForOrder(activeApp, e.record);
    e.next();
}, "orders");
