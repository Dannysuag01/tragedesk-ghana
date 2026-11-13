/**
 * Base Bookmaker Connector
 * Defines the contract for odds fetching and booking code generation.
 */

export class BaseBookmaker {
  /**
   * @param {string} name - Human readable bookmaker name (e.g. "Sportybet Ghana")
   * @param {string} baseUrl - Base URL for website/API
   */
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
  }

  /**
   * Fetches upcoming matches and odds from the bookmaker
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    throw new Error('fetchOdds() must be implemented by subclass');
  }

  /**
   * Generates a booking code for a betslip selection
   * @param {Object} selection { eventId, selectionId, stake }
   * @returns {Promise<string>} Booking code
   */
  async generateBookingCode(selection) {
    throw new Error('generateBookingCode() must be implemented by subclass');
  }
}

