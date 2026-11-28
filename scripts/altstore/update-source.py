#!/usr/bin/env python3
"""Update the AltStore/LiveContainer source JSON from an IPA file."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import plistlib
import zipfile


def read_ipa_info(path: str) -> dict:
    with zipfile.ZipFile(path) as archive:
        names = [
            name
            for name in archive.namelist()
            if name.startswith("Payload/")
            and name.count("/") == 2
            and name.endswith(".app/Info.plist")
        ]
        if not names:
            raise SystemExit(f"Info.plist not found in {path}")
        with archive.open(names[0]) as handle:
            return plistlib.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ipa", required=True)
    parser.add_argument("--url", required=True, help="public IPA download URL")
    parser.add_argument("--source", required=True, help="AltStore source JSON (gh-pages の repo/apps.json)")
    parser.add_argument("--date", default=dt.date.today().isoformat())
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    info = read_ipa_info(args.ipa)
    version = str(info.get("CFBundleShortVersionString", ""))
    build = str(info.get("CFBundleVersion", version))
    min_os = str(info.get("MinimumOSVersion", "15.0"))
    size = os.path.getsize(args.ipa)
    if not version:
        raise SystemExit("CFBundleShortVersionString is empty")

    with open(args.source, encoding="utf-8") as handle:
        source = json.load(handle)

    app = source["apps"][0]
    notes = args.notes or f"Release {version}"
    entry = {
        "version": version,
        "buildVersion": build,
        "date": args.date,
        "localizedDescription": notes,
        "downloadURL": args.url,
        "size": size,
        "minOSVersion": min_os,
    }
    app["versions"] = [
        item
        for item in app.get("versions", [])
        if not (item.get("version") == version and item.get("buildVersion") == build)
    ]
    app["versions"].insert(0, entry)
    # SideStore/older clients still read the top-level fields.
    app.update(
        version=version,
        versionDate=args.date,
        versionDescription=notes,
        downloadURL=args.url,
        size=size,
        minOSVersion=min_os,
    )

    news = source.setdefault("news", [])
    news_identifier = f"release-{version}-{build}"
    news = [
        item
        for item in news
        if item.get("identifier") != news_identifier
        and not str(item.get("identifier", "")).startswith(f"release-{version}")
        and item.get("title") != version
    ]
    news.insert(
        0,
        {
            "title": version,
            "identifier": news_identifier,
            "caption": notes,
            "date": args.date,
            "tintColor": source.get("tintColor", "#1E88E5"),
            "appID": app.get("bundleIdentifier"),
        },
    )
    source["news"] = news[:20]

    with open(args.source, "w", encoding="utf-8") as handle:
        json.dump(source, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"updated {args.source}: {version} ({build}), {size} bytes, minOS {min_os}")


if __name__ == "__main__":
    main()
