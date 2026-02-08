from playwright.sync_api import Playwright, sync_playwright


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto("http://127.0.0.1/")
    page.get_by_role("link", name="Advanced Editor").click()
    page.get_by_role("button", name="Choose File").click()
    page.get_by_role("button", name="Choose File").set_input_files("./test-files/ThePose.pose")
    page.get_by_role("textbox", name="Author name (max 50)").click()
    page.get_by_role("textbox", name="Author name (max 50)").fill("Playwright test")
    page.get_by_role("textbox", name="Description (max 160)").click()
    page.get_by_role("textbox", name="Description (max 160)").fill("Testing 1.2.3.45.54.56")
    page.get_by_role("textbox", name="Version (max 10)").click()
    page.get_by_role("textbox", name="Version (max 10)").fill("10.0.0.1")
    page.get_by_role("textbox", name="Press Space or Enter to add a").click()
    page.get_by_role("textbox", name="Press Space or Enter to add a").click()
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("qwe")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("qwe")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("qwe")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("w")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("ww")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("www")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("wwww")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_role("textbox", name="Press Space or Enter to add a").fill("www")
    page.get_by_role("textbox", name="Press Space or Enter to add a").press("Enter")
    page.get_by_text("qwe").nth(2).click()
    page.get_by_text("wwww").click()
    page.get_by_text("www").first.click()
    page.locator("#replaceImageInput").click()
    page.locator("#replaceImageInput").set_input_files("./test-files/honk.jpg")
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Create").click()
    download = download_info.value
    download.save_as("./test-results/" + download.suggested_filename)
    page.locator("#advResize").select_option("1080")
    with page.expect_download() as download1_info:
        page.get_by_role("button", name="Create").click()
    download1 = download1_info.value
    download1.save_as("./test-results/" + download.suggested_filename)
    page.locator("#advResize").select_option("480")
    with page.expect_download() as download2_info:
        page.get_by_role("button", name="Create").click()
    download2 = download2_info.value
    download2.save_as("./test-results/" + download.suggested_filename)
    page.locator("#advResize").select_option("none")
    with page.expect_download() as download3_info:
        page.get_by_role("button", name="Create").click()
    download3 = download3_info.value
    download3.save_as("./test-results/" + download.suggested_filename)

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
