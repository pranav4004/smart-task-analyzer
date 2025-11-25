from rest_framework import serializers


class TaskSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField()
    due_date = serializers.DateField(required=False, allow_null=True)
    estimated_hours = serializers.FloatField(required=False, allow_null=True)
    importance = serializers.IntegerField(min_value=1, max_value=10)
    dependencies = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True
    )

    def validate(self, data):
        # Default values if missing
        if data.get("estimated_hours") is None:
            data["estimated_hours"] = 1.0  # assume 1 hour if not provided

        if data.get("dependencies") is None:
            data["dependencies"] = []

        return data
