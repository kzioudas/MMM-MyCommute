/* Magic Mirror
 * Module: mrx-work-traffic
 *
 * By Dominic Marx
 * MIT Licensed.
 *
 * Updated to use node-fetch instead of deprecated request module.
 */

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const moment = require("moment");

module.exports = NodeHelper.create({
	start: function () {
		console.log("====================== Starting node_helper for module [" + this.name + "]");
	},

	// subclass socketNotificationReceived
	socketNotificationReceived: function (notification, payload) {
		if (notification === "GOOGLE_TRAFFIC_GET") {
			this.getPredictions(payload);
		}
	},

	getPredictions: function (payload) {
		const self = this;
		let returned = 0;
		const predictions = [];

		payload.destinations.forEach(async (dest, index) => {
			const prediction = { config: dest.config };

			try {
				const res = await fetch(dest.url);
				const data = await res.json();

				if (data.error_message) {
					console.log("MMM-MyCommute: " + data.error_message);
					prediction.error = true;
					prediction.error_msg = data.error_message;
				} else if (data.status !== "OK") {
					console.log("MMM-MyCommute: " + data.status);
					console.debug(data);
					prediction.error = true;
					prediction.error_msg = "data.status != OK: " + data.status;
				} else {
					const routeList = [];
					for (const r of data.routes) {
						const routeObj = {
							summary: r.summary,
							time: r.legs[0].duration.value
						};

						if (r.legs[0].duration_in_traffic) {
							routeObj.timeInTraffic = r.legs[0].duration_in_traffic.value;
						}

						if (dest.config.mode === "transit") {
							const transitInfo = [];
							let gotFirstTransitLeg = false;

							for (const s of r.legs[0].steps) {
								if (s.transit_details) {
									let arrivalTime = "";
									if (!gotFirstTransitLeg && dest.config.showNextVehicleDeparture) {
										gotFirstTransitLeg = true;
										arrivalTime = moment(s.transit_details.departure_time.value * 1000);
									}
									transitInfo.push({
										routeLabel: s.transit_details.line.short_name || s.transit_details.line.name,
										vehicle: s.transit_details.line.vehicle.type,
										arrivalTime
									});
								}
							}

							routeObj.transitInfo = transitInfo;

							if (transitInfo.length <= 0) {
								const travelModes = r.legs[0].steps.map(s => s.travel_mode).join(", ");
								console.log("MMM-MyCommute: transit directions do not contain any transits (" + travelModes + ")");
								prediction.error = true;
								prediction.error_msg = "No valid transit info found.";
							}
						}

						routeList.push(routeObj);
					}
					prediction.routes = routeList;
				}
			} catch (error) {
				console.error("MMM-MyCommute: fetch error", error);
				prediction.error = true;
				prediction.error_msg = error.toString();
			}

			predictions[index] = prediction;
			returned++;

			if (returned === payload.destinations.length) {
				self.sendSocketNotification("GOOGLE_TRAFFIC_RESPONSE" + payload.instanceId, predictions);
			}
		});
	}
});
