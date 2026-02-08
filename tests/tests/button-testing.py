import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto("http://127.0.0.1/")
    page.get_by_role("link", name="Advanced Editor").click()
    page.get_by_role("link", name="Simple Editor").click()
    page.locator("#advResize").select_option("none")
    page.locator("#advResize").select_option("1080")
    page.locator("#advResize").select_option("720")
    page.locator("#advResize").select_option("480")
    page.locator("span").first.click()
    page.get_by_role("link", name="Advanced Editor").click()
    page.locator("span").first.click()
    page.get_by_role("link", name="Simple Editor").click()
    with page.expect_popup() as page3_info:
        page.get_by_role("link", name="Discord Discord").click()
    page3 = page3_info.value
    page3.close()
    with page.expect_popup() as page4_info:
        page.get_by_role("link", name="GitHub GitHub").click()
    page4 = page4_info.value
    page4.close()
    page.get_by_role("link", name="Advanced Editor").click()
    with page.expect_popup() as page5_info:
        page.get_by_role("link", name="Discord Discord").click()
    page5 = page5_info.value
    page5.close()
    with page.expect_popup() as page6_info:
        page.get_by_role("link", name="GitHub GitHub").click()
    page6 = page6_info.value
    page6.close()
    page.get_by_role("button", name="Choose File").click()
    page.get_by_role("link", name="Simple Editor").click()
    page.locator("#imageFileInput").click()
    page.locator("#poseFileInput").click()
    page.get_by_role("button", name="Merge & Download").click()
    page.get_by_role("button", name="Merge & Download").click()
    page.get_by_role("button", name="Merge & Download").click()
    page.get_by_role("link", name="Advanced Editor").click()
    page.get_by_role("button", name="Choose File").click()
    page.get_by_role("link", name="Simple Editor").click()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
