var moment = require('moment');

// Util

function formatDate(date, format) {
    if(typeof date == 'number') {
        date = intToDate(date);
    }
    else if(typeof date == 'string') {
        date = intToDate(parseInt(date));
    }

    return date.format(format || 'MMMM Do YYYY');
}

function dateToInt(date) {
    return parseInt(date.format('YYYYMMDD'));
}

function intToDate(x) {
    return moment(x.toString(), 'YYYYMMDD');
}

function previousDates() {
    var current = moment();
    var end = moment().subtract('years', 2);
    var dates = [];

    while(current > end) {
        dates.push(dateToInt(current));
        current = current.subtract('days', 1);
    }

    return dates;
}

function tmpFile() {
    // TODO: use a proper tmp file lib
    return 'blogthing-' + Math.floor(Math.random()*10000) + Date.now();
}

function slugify(name) {
    return name.replace(/[ !@#$%^&*():"'|?=]/g, '-');
}

function handleError(err, next) {
    if(err) {
        if(next) {
            next(err);
        }
        else {
            console.error(err);
        }
    }

    return err;
}

module.exports = {
    formatDate: formatDate,
    dateToInt: dateToInt,
    intToDate: intToDate,
    previousDates: previousDates,
    tmpFile: tmpFile,
    slugify: slugify,
    handleError: handleError
};