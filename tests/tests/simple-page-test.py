from playwright.sync_api import Playwright, sync_playwright

def run(playwright: Playwright) -> None:

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto("http://127.0.0.1/")
    page.locator("#imageFileInput").click()
    page.locator("#imageFileInput").set_input_files("./test-files/honk.jpg")
    page.locator("#poseFileInput").click()
    page.locator("#poseFileInput").set_input_files("./test-files/ThePose.pose")
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Merge & Download").click()
    download = download_info.value
    download.save_as("./test-results/" + download.suggested_filename)

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
