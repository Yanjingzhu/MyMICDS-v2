/**
 * @file Reads calendar feed to determine schedule / day and other important events
 * @module portal
 */

var config = require(__dirname + '/config.js');

var _           = require('underscore');
var ical        = require('ical');
var querystring = require('querystring');
var request     = require('request');
var url         = require('url');

// URL Calendars come from
var urlPrefix = 'https://micds.myschoolapp.com/podium/feed/iCal.aspx?q=';
// Valid School Calendar ID.
// It doesn't matter which student this calendar belongs to, we just need to compare it
var schoolCalURL = urlPrefix + config.portal.schoolCalId;

/**
 * Makes sure a given url is valid and it points to a Canvas calendar feed
 * @function verifyURL
 *
 * @param {string} url - URI to iCal feed
 * @param {verifyURLCallback} callback - Callback
 */

/**
 * Returns whether url is valid or not
 * @callback verifyURLCallback
 *
 * @param {Object} err - Null if success, error object if failure.
 * @param {Boolean|string} isValid - True if valid URL, string describing problem if not valid. Null if error.
 * @param {string} url - Valid and formatted URL to our likings. Null if error or invalid url.
 */

function verifyURL(portalURL, callback) {

    if(typeof callback !== 'function') return;

    if(typeof portalURL !== 'string') {
        callback(new Error('Invalid URL!'), null, null);
        return;
    }

    // Parse URL first
    var parsedURL = url.parse(portalURL);
    var queries = querystring.parse(parsedURL.query);

    if(typeof queries.q !== 'string') {
        callback(null, 'URL does not contain calendar ID!', null);
        return;
    }

    var validURL = urlPrefix + queries.q;

    // Not lets see if we can actually get any data from here
    request(validURL, function(err, response, body) {
        if(err) {
            callback(new Error('There was a problem fetching portal data from the URL!'), null, null);
            return;
        }
        if(response.statusCode !== 200) {
            callback(null, 'Invalid URL!', null);
            return;
        }

        var data = ical.parseICS(body);

        // School Portal does not give a 404 if calendar is invalid. Instead, it gives an empty calendar.
        // Unlike Canvas, the portal is guaranteed to contain some sort of data within a span of a year.
        if(_.isEmpty(data)) {
            callback(null, false, null);
            return;
        }

        // Another fun thing about working with the portal is you can't tell what type of calendar we have.
        // We need to compare it with one of our school calendars
        request(schoolCalURL, function(err, schoolResponse, schoolBody) {
            if(err || response.statusCode !== 200) {
                callback(new Error('There was a problem fetching portal data from the URL!'), null, null);
                return;
            }

            // Check if school calendar and inputted calendar are the same
            var schoolData = ical.parseICS(schoolBody);
                // Strip id's from all the events so we can properly compare the two
            var calEvents = [];
            for(var eventUid in data) {
                var calEvent = data[eventUid];
                delete calEvent.uid;
                calEvents.push(calEvent);
            }
            var schoolCalEvents = [];
            for(var eventUid in schoolData) {
                var calEvent = schoolData[eventUid];
                delete calEvent.uid;
                schoolCalEvents.push(calEvent);
            }
                // If lengths are similar, it's _probably_ the calendar.
            if(schoolCalEvents.length === calEvents.length) {
                callback(null, 'This is your school calendar, we need your personal calendar!', null);
                return;
            }

            /*
            var similarEvents = 0;
            var differentEvents = 0;

            for(var i = 0; i < schoolCalEvents.length; i++) {
                var schoolCalEvent = schoolCalEvents[i];
                var calEvent = calEvents[i];

                if(schoolCalEvent === calEvent) {
                    similarEvents++;
                } else {
                    differentEvents++;
                }
            }

            console.log('\ncal event: (' + calEvents.length + ')\n');
            console.log('\nschool cal event: (' + schoolCalEvents.length + ')\n');

            console.log('There were ' + similarEvents + ' similar events and ' + differentEvents + ' different events');
            console.log('Ratio of similar events/total events: ' + (similarEvents/schoolCalEvents.length));
            console.log('Ratio of similar events/differentEvents: ' + (similarEvents/differentEvents));
            */

            // Check if we got the schedule

            callback(null, true, validURL);

        });

    });
}

/**
 * Queries a person's Portal RSS feed to get schedule and stuff
 * @function scheduleFeed
 *
 * @param {string} url - URL to iCal feed
 * @param {scheduleFeedCallback} callback - Callback after schedule is parsed
 */

/**
 * Callback after schedule feed is parsed
 * @callback scheduleFeedCallback
 *
 * @param {Object} that - Object reference to the schedule feed
 */

function scheduleFeed(url, callback) {
    var that = this;
    that.success = null;

    // Parses the schedule for given date and returns arrays
    this.getSchedule = function(day, month, year) {
        if(this.success) {
            // Default date
            var current = new Date();
            var schedule = [];
            var events = [];
            var scheduleDay;

            day = day || current.getDate();
            month = month || current.getMonth();
            year = year || current.getFullYear();

            // Get schedule from feed
            _.each(this.parsed, function(event, uid) {
                var eventDate = new Date(event.start);
                if(eventDate.getDate() === day && eventDate.getMonth() === month && eventDate.getFullYear() === year) {

                    // Check if it's an all-day event
                    if(eventDate.getSeconds() === 0 && eventDate.getMinutes() === 0 && eventDate.getHours() === 0) {
                        var period = {
                            'name': event.summary,
                            'description': event.description,
                            'location': event.location
                        };

                        if(/^Day [1-6]/.test(period.name)) {
                            scheduleDay = parseInt(period.name.match(/[1-6]/)[0]);
                        } else {
                            events.push(period);
                        }

                    } else {
                        var startPeriod = new Date(event.start);
                        var endPeriod   = new Date(event.end);

                        var period = {
                            'start': startPeriod,
                            'end'  : endPeriod,
                            'class': event.summary,
                            'description': event.description,
                            'location': event.location
                        };

                        // Overlap existing events
                        var startTime = startPeriod.getTime();
                        var endTime   = endPeriod.getTime();

                        schedule.forEach(function(block, index) {

                            var startBlock = block.start.getTime();
                            var endBlock   = block.end.getTime();

                            // If start is inside period but end is not
                            if((startBlock < startTime && startTime < endBlock) && endBlock < endTime) {
                                schedule[index].start = endPeriod;
                            }

                            // If end is inside period but start is not
                            if((startBlock < endTime && endTime < endBlock) && startTime < startBlock) {
                                schedule[index].end = startPeriod;
                            }

                            // If event is completely inside the event we're trying to add
                            if((startBlock < startTime && startTime < endBlock) && (startBlock < endTime && endTime < endBlock)) {
                                schedule.splice(index, 1);
                            }

                            // If the event is the exact same
                            if(startBlock === startTime && endBlock === endTime) {
                                schedule.splice(index, 1);
                            }

                            // If the event we're trying to add is completely inside the event
                            if(startBlock < startTime && endTime < endBlock) {
                                // Split this old event into two
                                var oldEnd = schedule[index].end;
                                schedule[index].end = startPeriod;

                                // Create second block and push it to the schedule; We will order later
                                var newBlock = schedule[index];
                                newBlock.start = endPeriod;
                                newBlock.end   = oldEnd;

                                schedule.push(newBlock);
                            }
                        });
                        schedule.push(period);
                    }
                }
            });

            // Order schedule
            schedule.sort(function(a, b) {
                var aStart = new Date(a.start).getTime();
                var bStart = new Date(b.start).getTime();
                return aStart - bStart;
            });

            return {
                'day': scheduleDay,
                'schedule': schedule,
                'events'  : events
            };
        } else {
            return {};
        }
    }

    verifyFeed(url, function(success, message, raw) {
        if(success) {
            that.success = true;
            that.message = message;
            that.parsed = ical.parseICS(raw);
        } else {
            that.success = false;
            that.message = message;
            that.parsed = null;
        }
        if(typeof callback === 'function') callback(that);
    });

}

module.exports.verifyURL    = verifyURL;
module.exports.scheduleFeed = scheduleFeed;
