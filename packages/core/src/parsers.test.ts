import { describe, expect, test } from "bun:test";
import { parseRoutes } from "./parsers";

describe("parseRoutes", () => {
  test("captures route buy-ticket metadata from search results", () => {
    const routes = parseRoutes(`
      <div class="search-results__item row">
        <div class="timeline__content-station">ignored</div>
        <div class="timeline__content-station">Warszawa Centralna</div>
        <div class="timeline__content-station">Kraków Główny</div>
        <div class="timeline__content-platform">Peron 3 Tor 4</div>
        <div class="timeline__content-platform">Peron 2 Tor 5</div>
        <div class="search-results__item-times--start">
          <span class="search-results__item-date">05.04.2026</span>
          <span class="search-results__item-hour">09:40</span>
        </div>
        <div class="search-results__item-times--end">
          <span class="search-results__item-date">05.04.2026</span>
          <span class="search-results__item-hour">12:27</span>
        </div>
        <div class="col-3 col-12--phone inline-center box--flex--column">
          <p class="item-label">PKP Intercity S.A.</p>
          <div class="search-results__item-train-nr">5350</div>
          <p class="item-label">Express InterCity</p>
          <div class="search-results__item-train-relation">Gdynia Główna - Zakopane</div>
        </div>
        <div class="search-results__item-train-nr txlc">2h:47min</div>
        <div class="add-arrow-to-right-before"><strong>0</strong></div>
        <a href="/WynikiWyszukiwania/SzczegolyPolaczenia?sid=abc"></a>
        <button
          class="btn buyTicket"
          data-buy-ticket-st="1;Warszawa Centralna;pl-PL;09:40;Kraków Główny;pl-PL;12:27;IC|BUY_STANDARD#"
          data-buy-ticket-cm="2;Warszawa Centralna;pl-PL;09:40;Kraków Główny;pl-PL;12:27;IC|BUY_SHARED#"
        >Kup bilet</button>
      </div>
    `);

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      departureStation: "Warszawa Centralna",
      arrivalStation: "Kraków Główny",
      detailsUrl: "/WynikiWyszukiwania/SzczegolyPolaczenia?sid=abc",
      buyTicketStandardData: "1;Warszawa Centralna;pl-PL;09:40;Kraków Główny;pl-PL;12:27;IC|BUY_STANDARD#",
      buyTicketSharedData: "2;Warszawa Centralna;pl-PL;09:40;Kraków Główny;pl-PL;12:27;IC|BUY_SHARED#",
    });
  });
});
