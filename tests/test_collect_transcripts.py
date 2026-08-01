from ingest.collect_transcripts import _infer_role, _infer_transcript_roles


def test_operator_label_wins_over_people_named_in_intro() -> None:
    assert _infer_role("Operator", "Our Chief Executive Officer is Jane Doe.") == "Operator"


def test_self_identified_investor_relations_is_not_the_named_ceo() -> None:
    text = (
        "My name is Suhasini Chandramouli, Director of Investor Relations. "
        "Speaking first today is Apple's CEO, Tim Cook."
    )
    assert _infer_role("Suhasini Chandramouli", text) == "IR"


def test_other_executive_title_is_not_assigned_to_current_speaker() -> None:
    assert _infer_role("Jane Doe", "I'll now hand it to our CFO, John Smith.") == ""


def test_role_embedded_in_speaker_label_is_accepted() -> None:
    assert _infer_role("Jane Doe, Chief Financial Officer", "Good afternoon.") == "CFO"


def test_role_next_to_current_speaker_name_is_accepted() -> None:
    text = "This is Jane Doe, Chief Financial Officer. Thank you for joining us."
    assert _infer_role("Jane Doe", text) == "CFO"


def test_unrelated_role_later_in_paragraph_is_not_accepted() -> None:
    text = "Thanks, everyone. I will turn the call over to our CEO, John Smith."
    assert _infer_role("Jane Doe", text) == ""


def test_i_am_joined_by_an_executive_is_not_self_identification() -> None:
    text = "I am joined today by William Oplinger, our President and Chief Executive Officer."
    assert _infer_role("Louis Langlois", text) == ""


def test_first_person_role_transition_is_accepted() -> None:
    assert _infer_role(
        "Kelly Young",
        "As I take on the role of CEO, I am mindful of the journey that brought us here.",
    ) == "CEO"
    assert _infer_role(
        "John Ternus",
        "Stepping into the role of CEO is an incredible honor, and it means a lot to me.",
    ) == "CEO"
    assert _infer_role(
        "Luca Maestri",
        "Serving as Apple's CFO has been a real privilege, and I've valued your support.",
    ) == "CFO"
    assert _infer_role(
        "Gary Fields",
        "I will be stepping down as CEO at our annual stockholders meeting.",
    ) == "CEO"


def test_roles_are_bound_to_the_named_person_not_the_first_title() -> None:
    assert _infer_role(
        "Stuart Ford",
        "I'm Stuart Ford, Head of Investor Relations, joined by our CEO and CFO.",
    ) == "IR"
    assert _infer_role(
        "Jorge Flores",
        "Our CEO, Jane Doe; COO, Jorge Flores; and CFO, John Smith are here.",
    ) == "COO"
    assert _infer_role(
        "Tyler Wilcox",
        "This is Tyler Wilcox, and joining me is Katie Bailey, our CFO.",
    ) == ""


def test_colloquial_or_third_party_titles_do_not_leak() -> None:
    assert _infer_role(
        "Ryan Ezell",
        "I think this is like any other E&P operator in the basin.",
    ) == ""
    assert _infer_role(
        "Tony Smurfit",
        "Smurfit Westrock is an owner/operator, and I'm happy with our progress.",
    ) == ""
    assert _infer_role(
        "Jane Doe",
        "I'm sure we will share more at our Analyst Day.",
    ) == ""


def test_transcript_roster_role_is_propagated_without_oscillation() -> None:
    segments = [
        {
            "speaker": "Suhasini Chandramouli",
            "role": "",
            "text": (
                "My name is Suhasini Chandramouli, Director of Investor Relations. "
                "Speaking first is Apple's CEO, Tim Cook, followed by CFO, Kevan Parekh."
            ),
        },
        {"speaker": "Tim Cook", "role": "", "text": "Thank you, Suhasini."},
        {"speaker": "Suhasini Chandramouli", "role": "", "text": "Operator, next question."},
        {"speaker": "Kevan Parekh", "role": "", "text": "Revenue grew this quarter."},
    ]
    assert _infer_transcript_roles(segments) == ["IR", "CEO", "IR", "CFO"]
